export interface FileRegistration {
  name: string;
  type: 'file-handle' | 'url' | 'path';
  handle?: FileSystemFileHandle;
  url?: string;
  path?: string;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified?: Date;
}

export interface QueryResult {
  rows: any[];
  columns: ColumnInfo[];
  rowCount: number;
  row_count?: number; // Tauri uses snake_case
  queryTime?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface TableInfo {
  database: string;
  schema: string;
  name: string;
  type: 'table' | 'view';
  rowCount?: number;
}

export interface DatabaseInfo {
  name: string;
  schemas: string[];
}

export interface CatalogInfo {
  databases: DatabaseInfo[];
}

export interface PreparedStatement {
  id: string;
  query: (...params: any[]) => Promise<QueryResult>;
  close: () => Promise<void>;
}

// Strict engine type enum
export type EngineType = 'duckdb-wasm' | 'duckdb-tauri';

// Storage type enum
export type StorageType = 'memory' | 'persistent';

export interface ExtensionOptions {
  path?: string;
  config?: Record<string, any>;
}

export interface ExtensionInfo {
  name: string;
  loaded: boolean;
  version?: string;
}

export interface EngineCapabilities {
  supportsStreaming: boolean;
  supportsMultiThreading: boolean;
  supportsDirectFileAccess: boolean;
  supportsExtensions: boolean;
  supportsPersistence: boolean;
  supportsRemoteFiles: boolean;
  maxFileSize?: number;
  maxMemory?: number;
  supportedFileFormats: readonly string[];
  supportedExtensions: readonly string[];
}

export interface EngineConfig {
  type: EngineType;
  persistent?: boolean; // Legacy property for tests
  storageType?: StorageType;
  storagePath?: string;
  workerUrl?: string;
  wasmUrl?: string;
  extensions?: string[] | Array<{ name: string; type: 'core' | 'community' }>;
  options?: Record<string, any>;
  poolSize?: number;
}

export interface DatabaseConnection {
  id: string;
  execute: (sql: string, params?: any[]) => Promise<QueryResult>;
  stream: (sql: string, params?: any[]) => AsyncGenerator<any>;
  prepare: (sql: string) => Promise<PreparedStatement>;
  close: () => Promise<void>;
  isOpen: () => boolean;
  hasAttachedDbsLoaded?: () => boolean;
  markAttachedDbsLoaded?: () => void;
  hasExtensionsLoaded?: () => boolean;
  markExtensionsLoaded?: () => void;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  connectionsCreated?: number;
  connectionsDestroyed?: number;
  acquireCount?: number;
  releaseCount?: number;
  timeoutCount?: number;
}

export interface ConnectionPool {
  // Core connection pool methods
  acquire: () => Promise<DatabaseConnection>;
  release: (connection: DatabaseConnection) => Promise<void>;
  close: () => Promise<void>;
  getStats?: () => PoolStats | null;

  // High-level query methods (used by the app)
  query: <_T = any>(sql: string) => Promise<any>;
  queryAbortable?: <_T = any>(
    sql: string,
    signal: AbortSignal,
  ) => Promise<{ value: any; aborted: boolean }>;
  send?: <_T = any>(sql: string, stream?: boolean) => Promise<any>;
  sendAbortable?: <_T = any>(
    sql: string,
    signal: AbortSignal,
    stream?: boolean,
    options?: any,
  ) => Promise<any>;
  getPooledConnection?: () => Promise<any>;
  getTableNames?: (database: string, schema: string) => Promise<any>;

  // Force checkpoint for persistence
  forceCheckpoint?: () => Promise<boolean>;

  // Access to underlying bindings (for WASM-specific operations)
  bindings?: any;
}

export interface DatabaseEngine {
  // Lifecycle
  initialize: (config: EngineConfig) => Promise<void>;
  shutdown: () => Promise<void>;
  isReady: () => boolean;

  // Connection Management
  createConnection: () => Promise<DatabaseConnection>;
  createConnectionPool: (size: number) => Promise<ConnectionPool>;

  // File Operations
  registerFile: (options: FileRegistration) => Promise<void>;
  dropFile: (name: string) => Promise<void>;
  listFiles: () => Promise<FileInfo[]>;

  // Query Execution
  execute: (sql: string, params?: any[]) => Promise<QueryResult>;
  stream: (sql: string, params?: any[]) => AsyncGenerator<any>;
  prepare: (sql: string) => Promise<PreparedStatement>;

  // Metadata
  getCatalog: () => Promise<CatalogInfo>;
  getDatabases: () => Promise<DatabaseInfo[]>;
  getTables: (database: string) => Promise<TableInfo[]>;
  getColumns: (database: string, table: string) => Promise<ColumnInfo[]>;

  // Persistence
  checkpoint: () => Promise<void>;

  // Extensions
  loadExtension: (name: string, options?: ExtensionOptions) => Promise<void>;
  listExtensions: () => Promise<ExtensionInfo[]>;

  // Features
  getCapabilities: () => EngineCapabilities;
}
