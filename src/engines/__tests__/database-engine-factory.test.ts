import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DatabaseEngineFactory } from '../database-engine-factory';
import { DuckDBTauriEngine } from '../duckdb-tauri-engine';
import { DuckDBWasmEngine } from '../duckdb-wasm-engine';

// Mock the engine imports
jest.mock('../duckdb-wasm-engine');
jest.mock('../duckdb-tauri-engine');

// Helper to create a mock engine
function createMockEngine(type: string): any {
  const mockFn = (...args: any[]) => jest.fn(...args);
  return {
    type,
    initialize: mockFn().mockResolvedValue(undefined),
    shutdown: mockFn().mockResolvedValue(undefined),
    isReady: mockFn().mockReturnValue(true),
    createConnection: mockFn().mockResolvedValue({
      id: 'mock-connection',
      execute: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
      stream: mockFn(),
      prepare: mockFn().mockResolvedValue({
        id: 'mock-statement',
        query: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
        close: mockFn().mockResolvedValue(undefined),
      }),
      close: mockFn().mockResolvedValue(undefined),
      isOpen: mockFn().mockReturnValue(true),
    }),
    createConnectionPool: mockFn().mockResolvedValue({
      acquire: mockFn().mockResolvedValue({
        id: 'mock-connection',
        execute: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
        stream: mockFn(),
        prepare: mockFn().mockResolvedValue({
          id: 'mock-statement',
          query: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
          close: mockFn().mockResolvedValue(undefined),
        }),
        close: mockFn().mockResolvedValue(undefined),
        isOpen: mockFn().mockReturnValue(true),
      }),
      release: mockFn().mockResolvedValue(undefined),
      close: mockFn().mockResolvedValue(undefined),
      getStats: mockFn().mockReturnValue({
        totalConnections: 1,
        activeConnections: 0,
        idleConnections: 1,
        waitingRequests: 0,
      }),
    }),
    registerFile: mockFn().mockResolvedValue(undefined),
    dropFile: mockFn().mockResolvedValue(undefined),
    listFiles: mockFn().mockResolvedValue([]),
    execute: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
    stream: mockFn(),
    prepare: mockFn().mockResolvedValue({
      id: 'mock-statement',
      query: mockFn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
      close: mockFn().mockResolvedValue(undefined),
    }),
    getCatalog: mockFn().mockResolvedValue({ databases: [] }),
    getDatabases: mockFn().mockResolvedValue([]),
    getTables: mockFn().mockResolvedValue([]),
    getColumns: mockFn().mockResolvedValue([]),
    checkpoint: mockFn().mockResolvedValue(undefined),
    export: mockFn().mockResolvedValue(new ArrayBuffer(0)),
    import: mockFn().mockResolvedValue(undefined),
    loadExtension: mockFn().mockResolvedValue(undefined),
    listExtensions: mockFn().mockResolvedValue([]),
    getCapabilities: mockFn().mockReturnValue({
      supportsStreaming: true,
      supportsMultiThreading: false,
      supportsDirectFileAccess: false,
      supportsExtensions: true,
      supportsPersistence: false,
      supportsRemoteFiles: false,
      supportedFileFormats: ['csv', 'parquet', 'json'],
      supportedExtensions: [],
    }),
    transformResult: mockFn((result: any) => result),
  };
}

describe('DatabaseEngineFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the factory cache
    (DatabaseEngineFactory as any).engineCache.clear();
    // Reset window object
    (global as any).window = { __TAURI__: undefined };
  });

  describe('createEngine', () => {
    it('should create a DuckDB WASM engine by default', async () => {
      const mockEngine = createMockEngine('duckdb-wasm');
      (DuckDBWasmEngine as jest.MockedClass<typeof DuckDBWasmEngine>).mockImplementation(
        () => mockEngine,
      );

      const engine = await DatabaseEngineFactory.createEngine(
        DatabaseEngineFactory.detectOptimalEngine(),
      );

      expect(engine).toBe(mockEngine);
      expect(DuckDBWasmEngine).toHaveBeenCalledWith();
    });

    it('should create a DuckDB Tauri engine when in Tauri environment', async () => {
      // Mock Tauri environment
      (global as any).window = { __TAURI__: {} };
      const mockEngine = createMockEngine('duckdb-tauri');
      (DuckDBTauriEngine as jest.MockedClass<typeof DuckDBTauriEngine>).mockImplementation(
        () => mockEngine,
      );

      const engine = await DatabaseEngineFactory.createEngine(
        DatabaseEngineFactory.detectOptimalEngine(),
      );

      expect(engine).toBe(mockEngine);
      expect(DuckDBTauriEngine).toHaveBeenCalledWith();
    });

    it('should use custom configuration when provided', async () => {
      const customConfig = {
        type: 'duckdb-wasm' as const,
        persistent: true,
        wasmUrl: '/custom/path',
      };
      const mockEngine = createMockEngine('duckdb-wasm');
      (DuckDBWasmEngine as jest.MockedClass<typeof DuckDBWasmEngine>).mockImplementation(
        () => mockEngine,
      );

      const engine = await DatabaseEngineFactory.createEngine(customConfig);

      expect(engine).toBe(mockEngine);
      expect(DuckDBWasmEngine).toHaveBeenCalledWith();
    });

    it('should cache engines by configuration', async () => {
      const mockEngine = createMockEngine('duckdb-wasm');
      (DuckDBWasmEngine as jest.MockedClass<typeof DuckDBWasmEngine>).mockImplementation(
        () => mockEngine,
      );

      const engine1 = await DatabaseEngineFactory.createEngine(
        DatabaseEngineFactory.detectOptimalEngine(),
      );
      const engine2 = await DatabaseEngineFactory.createEngine(
        DatabaseEngineFactory.detectOptimalEngine(),
      );

      expect(engine1).toBe(engine2);
      expect(DuckDBWasmEngine).toHaveBeenCalledTimes(1);
    });

    it('should create different engines for different configurations', async () => {
      const mockEngine1 = createMockEngine('duckdb-wasm');
      const mockEngine2 = createMockEngine('duckdb-wasm');
      (DuckDBWasmEngine as jest.MockedClass<typeof DuckDBWasmEngine>)
        .mockImplementationOnce(() => mockEngine1)
        .mockImplementationOnce(() => mockEngine2);

      const engine1 = await DatabaseEngineFactory.createEngine({
        type: 'duckdb-wasm',
        persistent: false,
      });
      const engine2 = await DatabaseEngineFactory.createEngine({
        type: 'duckdb-wasm',
        persistent: true,
      });

      expect(engine1).not.toBe(engine2);
      expect(DuckDBWasmEngine).toHaveBeenCalledTimes(2);
    });

    it('should throw an error for unsupported engine types', async () => {
      await expect(
        DatabaseEngineFactory.createEngine({ type: 'unsupported' as any }),
      ).rejects.toThrow('Unsupported database engine type: unsupported');
    });
  });

  describe('detectOptimalEngine', () => {
    it('should detect Tauri environment correctly', () => {
      (global as any).window = { __TAURI__: {} };

      const config = DatabaseEngineFactory.detectOptimalEngine();

      expect(config.type).toBe('duckdb-tauri');
      expect(config.persistent).toBe(true);
    });

    it('should default to WASM when not in Tauri', () => {
      (global as any).window = {};

      const config = DatabaseEngineFactory.detectOptimalEngine();

      expect(config.type).toBe('duckdb-wasm');
      expect(config.persistent).toBe(false);
    });

    it('should handle missing window object', () => {
      (global as any).window = undefined;

      const config = DatabaseEngineFactory.detectOptimalEngine();

      expect(config.type).toBe('duckdb-wasm');
      expect(config.persistent).toBe(false);
    });
  });

  describe('caching', () => {
    it('should generate unique cache keys for different configurations', () => {
      const { getCacheKey } = DatabaseEngineFactory as any;

      const key1 = getCacheKey({ type: 'duckdb-wasm', persistent: false });
      const key2 = getCacheKey({ type: 'duckdb-wasm', persistent: true });
      const key3 = getCacheKey({ type: 'duckdb-tauri', persistent: true });

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });

    it('should generate consistent cache keys for same configurations', () => {
      const { getCacheKey } = DatabaseEngineFactory as any;

      const config = { type: 'duckdb-wasm' as const, persistent: false, wasmUrl: '/path' };
      const key1 = getCacheKey(config);
      const key2 = getCacheKey({ ...config });

      expect(key1).toBe(key2);
    });
  });
});
