import { DBPersistenceState } from '@models/db-persistence';
import { OPFSUtil } from '@utils/opfs';

// DuckDB requires "opfs://" prefix for OPFS paths
export const PERSISTENT_DB_NAME = 'pondpilot';
const DB_FILE_PATH = `${PERSISTENT_DB_NAME}.db`;
const DB_FULL_PATH = `opfs://${DB_FILE_PATH}`;

const DEFAULT_STATE: DBPersistenceState = {
  mode: 'persistent',
  dbPath: DB_FULL_PATH,
  dbSize: 0,
  lastSync: null,
};

export class DBPersistenceController {
  private opfsUtil: OPFSUtil;
  private state: DBPersistenceState;
  private initialized: boolean = false;

  constructor(opfsUtil: OPFSUtil) {
    this.opfsUtil = opfsUtil;
    this.state = { ...DEFAULT_STATE };

    // Add event listener for beforeunload to ensure file handles are closed properly
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanupResources();
      });
    }
  }

  /**
   * Clean up resources when the controller is done
   */
  public async cleanupResources() {
    if (this.initialized) {
      await this.opfsUtil.closeAllHandles();
    }
  }

  /**
   * Initialize the database persistence.
   * This checks if OPFS is available and creates the necessary handles.
   */
  public async initialize(): Promise<DBPersistenceState> {
    const opfsAvailable = await this.opfsUtil.isAvailable();

    if (!opfsAvailable) {
      throw new Error('OPFS not available');
    }

    // Get or create file handle - this ensures the file is accessible in OPFS
    try {
      // This will create the file handle if it doesn't exist
      await this.opfsUtil.getFileHandle(DB_FILE_PATH);
    } catch (error) {
      throw new Error('Failed to create file handle');
    }

    const dbExists = await this.opfsUtil.fileExists(DB_FILE_PATH);

    if (dbExists) {
      const dbSize = await this.getDBSize();
      this.state = {
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize,
        lastSync: new Date(),
      };
    } else {
      // Initialize with persistent mode, but database doesn't exist yet
      this.state = {
        mode: 'persistent',
        dbPath: DB_FULL_PATH,
        dbSize: 0,
        lastSync: null,
      };
    }

    this.initialized = true;

    return this.state;
  }

  /**
   * Export the database as a binary buffer
   */
  public async exportDB(): Promise<ArrayBuffer | null> {
    try {
      return await this.opfsUtil.readFile(DB_FILE_PATH);
    } catch (error) {
      return null;
    }
  }

  /**
   * Import database from a binary buffer
   */
  public async importDB(data: ArrayBuffer): Promise<boolean> {
    try {
      await this.opfsUtil.storeFile(DB_FILE_PATH, data);

      this.state = {
        mode: 'persistent',
        dbPath: DB_FILE_PATH,
        dbSize: data.byteLength,
        lastSync: new Date(),
      };

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear the database
   */
  public async clearDB(): Promise<boolean> {
    try {
      await this.opfsUtil.deleteFile(DB_FILE_PATH);

      await this.opfsUtil.getFileHandle(DB_FILE_PATH, true);

      this.state = {
        ...this.state,
        dbSize: 0,
        lastSync: null,
      };

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the current database size
   */
  public async getDBSize(): Promise<number> {
    try {
      const exists = await this.opfsUtil.fileExists(DB_FILE_PATH);
      if (!exists) {
        return 0;
      }

      const size = await this.opfsUtil.getFileSize(DB_FILE_PATH);
      this.state.dbSize = size;
      return size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get the current persistence state
   */
  public getState(): DBPersistenceState {
    return { ...this.state };
  }

  /**
   * Update the last sync timestamp
   * This should be called whenever we know the database has been modified
   */
  public async updateLastSync(): Promise<DBPersistenceState> {
    if (this.state.mode === 'persistent') {
      this.state = {
        ...this.state,
        lastSync: new Date(),
        dbSize: await this.getDBSize(),
      };
    }

    return this.state;
  }
}
