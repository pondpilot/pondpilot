import { DBPersistenceController } from '@controllers/db-persistence';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DB_FILE_PATH, DB_FULL_PATH, DEFAULT_STATE } from '@models/db-persistence';
import { OPFSUtil } from '@utils/opfs';

type OPFSOperation =
  | 'isAvailable'
  | 'getFileHandle'
  | 'fileExists'
  | 'getFileSize'
  | 'readFile'
  | 'storeFile'
  | 'deleteFile'
  | 'closeAllHandles';

class FakeOPFSUtil {
  public readonly calls: string[] = [];
  public available = true;
  public exists = false;
  public size = 0;
  public data: ArrayBuffer | null = null;

  private readonly pendingFailures = new Map<OPFSOperation, number>();

  public failNext(...operations: OPFSOperation[]): void {
    for (const operation of operations) {
      this.pendingFailures.set(operation, (this.pendingFailures.get(operation) ?? 0) + 1);
    }
  }

  private throwIfFailed(operation: OPFSOperation): void {
    const remaining = this.pendingFailures.get(operation) ?? 0;
    if (remaining === 0) return;

    if (remaining === 1) {
      this.pendingFailures.delete(operation);
    } else {
      this.pendingFailures.set(operation, remaining - 1);
    }

    throw new Error(`simulated ${operation} failure`);
  }

  public async isAvailable(): Promise<boolean> {
    this.calls.push('isAvailable');
    this.throwIfFailed('isAvailable');
    return this.available;
  }

  public async getFileHandle(
    filename: string,
    create: boolean = true,
  ): Promise<FileSystemFileHandle> {
    this.calls.push(`getFileHandle:${filename}:${create}`);
    this.throwIfFailed('getFileHandle');
    if (create) this.exists = true;
    return {} as FileSystemFileHandle;
  }

  public async fileExists(path: string): Promise<boolean> {
    this.calls.push(`fileExists:${path}`);
    this.throwIfFailed('fileExists');
    return this.exists;
  }

  public async getFileSize(path: string): Promise<number> {
    this.calls.push(`getFileSize:${path}`);
    this.throwIfFailed('getFileSize');
    return this.size;
  }

  public async readFile(path: string): Promise<ArrayBuffer> {
    this.calls.push(`readFile:${path}`);
    this.throwIfFailed('readFile');
    return this.data ?? new ArrayBuffer(this.size);
  }

  public async storeFile(path: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    this.calls.push(`storeFile:${path}:${data.byteLength}`);
    this.throwIfFailed('storeFile');
    this.exists = true;
    this.size = data.byteLength;
    this.data = data instanceof ArrayBuffer ? data : data.slice().buffer;
  }

  public async deleteFile(path: string): Promise<void> {
    this.calls.push(`deleteFile:${path}`);
    this.throwIfFailed('deleteFile');
    this.exists = false;
    this.size = 0;
    this.data = null;
  }

  public async closeAllHandles(): Promise<void> {
    this.calls.push('closeAllHandles');
    this.throwIfFailed('closeAllHandles');
  }
}

const NOW = new Date('2026-07-10T14:30:00.000Z');

const makeController = (opfs = new FakeOPFSUtil()) => ({
  controller: new DBPersistenceController(opfs as unknown as OPFSUtil),
  opfs,
});

describe('DBPersistenceController', () => {
  const originalAddEventListener = Object.getOwnPropertyDescriptor(window, 'addEventListener');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Object.defineProperty(window, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalAddEventListener) {
      Object.defineProperty(window, 'addEventListener', originalAddEventListener);
    } else {
      delete (window as unknown as { addEventListener?: unknown }).addEventListener;
    }
  });

  describe('initialization and cleanup', () => {
    it('starts with an isolated copy of the default state', () => {
      const { controller } = makeController();

      const state = controller.getState();
      state.dbSize = 99;

      expect(controller.getState()).toEqual(DEFAULT_STATE);
    });

    it('rejects unavailable OPFS without creating or closing handles', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.available = false;
      const { controller } = makeController(opfs);

      await expect(controller.initialize()).rejects.toThrow('OPFS not available');
      await controller.cleanupResources();

      expect(opfs.calls).toEqual(['isAvailable']);
      expect(controller.getState()).toEqual(DEFAULT_STATE);
    });

    it('checks for the database before creating a missing file', async () => {
      const { controller, opfs } = makeController();

      await expect(controller.initialize()).resolves.toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 0,
        lastSync: null,
      });

      expect(opfs.calls).toEqual([
        'isAvailable',
        `fileExists:${DB_FILE_PATH}`,
        `getFileHandle:${DB_FILE_PATH}:true`,
      ]);
      expect(opfs.exists).toBe(true);
    });

    it('reports missing-file creation failures without partially initializing', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.failNext('getFileHandle');
      const { controller } = makeController(opfs);

      await expect(controller.initialize()).rejects.toThrow('Failed to create file handle');
      await controller.cleanupResources();

      expect(opfs.calls).toEqual([
        'isAvailable',
        `fileExists:${DB_FILE_PATH}`,
        `getFileHandle:${DB_FILE_PATH}:true`,
      ]);
      expect(controller.getState()).toEqual(DEFAULT_STATE);
    });

    it('loads the persisted file size and marks the controller initialized', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 4096;
      const { controller } = makeController(opfs);

      await expect(controller.initialize()).resolves.toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 4096,
        lastSync: NOW,
      });
      await controller.cleanupResources();

      expect(opfs.calls).toEqual([
        'isAvailable',
        `fileExists:${DB_FILE_PATH}`,
        `fileExists:${DB_FILE_PATH}`,
        `getFileSize:${DB_FILE_PATH}`,
        'closeAllHandles',
      ]);
    });

    it('surfaces an initial size-read failure without partially initializing', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 4096;
      opfs.failNext('getFileSize');
      const { controller } = makeController(opfs);

      await expect(controller.initialize()).rejects.toThrow('simulated getFileSize failure');
      await controller.cleanupResources();

      expect(opfs.calls).toEqual([
        'isAvailable',
        `fileExists:${DB_FILE_PATH}`,
        `fileExists:${DB_FILE_PATH}`,
        `getFileSize:${DB_FILE_PATH}`,
      ]);
      expect(controller.getState()).toEqual(DEFAULT_STATE);
    });

    it('allows cleanup to be retried after closing handles fails', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.failNext('closeAllHandles');
      const { controller } = makeController(opfs);
      await controller.initialize();

      await expect(controller.cleanupResources()).rejects.toThrow(
        'simulated closeAllHandles failure',
      );
      await expect(controller.cleanupResources()).resolves.toBeUndefined();

      expect(opfs.calls.filter((call) => call === 'closeAllHandles')).toHaveLength(2);
    });
  });

  describe('database transfer', () => {
    it('exports the persisted bytes', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.data = new Uint8Array([1, 2, 3]).buffer;
      const { controller } = makeController(opfs);

      await expect(controller.exportDB()).resolves.toBe(opfs.data);
      expect(opfs.calls).toEqual([`readFile:${DB_FILE_PATH}`]);
    });

    it('returns null when the persisted file cannot be read', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.failNext('readFile');
      const { controller } = makeController(opfs);

      await expect(controller.exportDB()).resolves.toBeNull();
      expect(opfs.calls).toEqual([`readFile:${DB_FILE_PATH}`]);
    });

    it('updates persistence metadata only after an import is stored', async () => {
      const { controller, opfs } = makeController();
      const data = new Uint8Array([4, 5, 6, 7]).buffer;

      await expect(controller.importDB(data)).resolves.toBe(true);

      expect(opfs.calls).toEqual([`storeFile:${DB_FILE_PATH}:4`]);
      expect(controller.getState()).toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 4,
        lastSync: NOW,
      });
    });

    it('preserves the previous state when storing an import fails', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 512;
      const { controller } = makeController(opfs);
      await controller.initialize();
      const previousState = controller.getState();
      opfs.failNext('storeFile');

      await expect(controller.importDB(new ArrayBuffer(1024))).resolves.toBe(false);

      expect(controller.getState()).toEqual(previousState);
      expect(opfs.size).toBe(512);
    });
  });

  describe('clearing persisted data', () => {
    it('deletes and recreates the database file before resetting metadata', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 2048;
      const { controller } = makeController(opfs);
      await controller.initialize();
      opfs.calls.length = 0;

      await expect(controller.clearDB()).resolves.toBe(true);

      expect(opfs.calls).toEqual([
        `deleteFile:${DB_FILE_PATH}`,
        `getFileHandle:${DB_FILE_PATH}:true`,
      ]);
      expect(opfs.exists).toBe(true);
      expect(controller.getState()).toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 0,
        lastSync: null,
      });
    });

    it('preserves metadata and does not recreate the file when deletion fails', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 2048;
      const { controller } = makeController(opfs);
      await controller.initialize();
      const previousState = controller.getState();
      opfs.calls.length = 0;
      opfs.failNext('deleteFile');

      await expect(controller.clearDB()).resolves.toBe(false);

      expect(opfs.calls).toEqual([`deleteFile:${DB_FILE_PATH}`]);
      expect(opfs.exists).toBe(true);
      expect(controller.getState()).toEqual(previousState);
    });

    it('resets metadata when recreation fails after deletion', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 2048;
      const { controller } = makeController(opfs);
      await controller.initialize();
      opfs.calls.length = 0;
      opfs.failNext('getFileHandle');

      await expect(controller.clearDB()).resolves.toBe(false);

      expect(opfs.calls).toEqual([
        `deleteFile:${DB_FILE_PATH}`,
        `getFileHandle:${DB_FILE_PATH}:true`,
      ]);
      expect(opfs.exists).toBe(false);
      expect(controller.getState()).toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 0,
        lastSync: null,
      });
    });
  });

  describe('size and synchronization metadata', () => {
    it('returns zero without requesting a size when the database is absent', async () => {
      const { controller, opfs } = makeController();

      await expect(controller.getDBSize()).resolves.toBe(0);

      expect(opfs.calls).toEqual([`fileExists:${DB_FILE_PATH}`]);
      expect(controller.getState()).toEqual(DEFAULT_STATE);
    });

    it('keeps the last known size when a direct size refresh fails', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 2048;
      const { controller } = makeController(opfs);
      await controller.initialize();
      opfs.failNext('getFileSize');

      const previousState = controller.getState();

      await expect(controller.getDBSize()).rejects.toThrow('simulated getFileSize failure');

      expect(controller.getState()).toEqual(previousState);
    });

    it('refreshes size and last-sync time together', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 100;
      const { controller } = makeController(opfs);
      await controller.initialize();
      opfs.size = 300;
      jest.setSystemTime(new Date('2026-07-10T15:00:00.000Z'));

      await expect(controller.updateLastSync()).resolves.toEqual({
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 300,
        lastSync: new Date('2026-07-10T15:00:00.000Z'),
      });

      expect(controller.getState().dbSize).toBe(300);
    });

    it('preserves size and sync time when the size lookup fails', async () => {
      const opfs = new FakeOPFSUtil();
      opfs.exists = true;
      opfs.size = 100;
      const { controller } = makeController(opfs);
      await controller.initialize();
      const previousState = controller.getState();
      opfs.failNext('getFileSize');
      jest.setSystemTime(new Date('2026-07-10T15:00:00.000Z'));

      await expect(controller.updateLastSync()).rejects.toThrow('simulated getFileSize failure');

      expect(controller.getState()).toEqual(previousState);
    });
  });
});
