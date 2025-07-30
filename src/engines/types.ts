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

export type ExportFormat = 'parquet' | 'csv' | 'json' | 'arrow';

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
  supportedFileFormats: string[];
  supportedExtensions: string[];
}

export interface EngineConfig {
  type: 'duckdb-wasm' | 'duckdb-native' | 'duckdb-tauri' | 'sqlite';
  storageType?: 'memory' | 'persistent';
  storagePath?: string;
  workerUrl?: string;
  wasmUrl?: string;
  extensions?: string[];
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
}

export interface ConnectionPool {
  acquire: () => Promise<DatabaseConnection>;
  release: (connection: DatabaseConnection) => Promise<void>;
  destroy: () => Promise<void>;
  size: () => number;
  available: () => number;
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
  export: (format: ExportFormat) => Promise<ArrayBuffer | string>;
  import: (data: ArrayBuffer | string, format: ExportFormat) => Promise<void>;

  // Extensions
  loadExtension: (name: string, options?: ExtensionOptions) => Promise<void>;
  listExtensions: () => Promise<ExtensionInfo[]>;

  // Features
  getCapabilities: () => EngineCapabilities;
}
