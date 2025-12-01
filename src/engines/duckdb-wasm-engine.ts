import * as duckdb from '@duckdb/duckdb-wasm';
import { v4 as uuidv4 } from 'uuid';

import { DuckDBWasmConnection } from './duckdb-wasm-connection';
import { DuckDBWasmConnectionPool } from './duckdb-wasm-connection-pool';
import { InitializationError, FileOperationError } from './errors';
import {
  DatabaseEngine,
  DatabaseConnection,
  ConnectionPool,
  EngineConfig,
  EngineCapabilities,
  FileRegistration,
  FileInfo,
  QueryResult,
  PreparedStatement,
  CatalogInfo,
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  ExtensionOptions,
  ExtensionInfo,
} from './types';

function isFileSystemHandle(handle: unknown): handle is FileSystemFileHandle {
  return typeof (handle as FileSystemFileHandle)?.getFile === 'function';
}

function isBrowserFile(handle: unknown): handle is File {
  return typeof File !== 'undefined' && handle instanceof File;
}

export class DuckDBWasmEngine implements DatabaseEngine {
  private worker: Worker | null = null;
  private _db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger;
  private bundles: duckdb.DuckDBBundles;
  private ready = false;
  private config: EngineConfig | null = null;
  private registeredFiles: Map<string, FileRegistration> = new Map();

  constructor() {
    this.logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    this.bundles = duckdb.getJsDelivrBundles();
  }

  get db(): duckdb.AsyncDuckDB | null {
    return this._db;
  }

  async initialize(config: EngineConfig): Promise<void> {
    this.config = config;

    try {
      // Select bundle
      const bundle = await duckdb.selectBundle(this.bundles);

      // Create worker
      const workerUrl =
        config.workerUrl ||
        URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
        );

      this.worker = new Worker(workerUrl);
      this._db = new duckdb.AsyncDuckDB(this.logger, this.worker);

      // Instantiate DuckDB
      await this._db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // Open database
      const dbConfig: duckdb.DuckDBConfig = {
        query: {
          castDecimalToDouble: true,
        },
      };

      if (config.storageType === 'persistent' && config.storagePath) {
        dbConfig.path = config.storagePath;
        dbConfig.accessMode = duckdb.DuckDBAccessMode.READ_WRITE;
      }

      await this._db.open(dbConfig);

      // Workaround for OPFS write mode issue
      if (config.storageType === 'persistent') {
        const conn = await this._db.connect();
        const tempTable = `temp_${uuidv4().replace(/-/g, '_')}`;
        await conn.query(`CREATE OR REPLACE TABLE ${tempTable} AS SELECT 1;`);
        await conn.query(`DROP TABLE ${tempTable};`);
        await conn.close();
      }

      // Load extensions if specified
      for (const ext of config.extensions || []) {
        // Handle both string and object formats
        const extensionName = typeof ext === 'string' ? ext : ext.name;
        await this.loadExtension(extensionName);
      }

      this.ready = true;
    } catch (error) {
      throw new InitializationError(
        `Failed to initialize DuckDB WASM: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error },
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._db = null;
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async createConnection(): Promise<DatabaseConnection> {
    if (!this._db) {
      throw new InitializationError('Database not initialized');
    }
    const conn = await this._db.connect();
    return new DuckDBWasmConnection(uuidv4(), conn, this);
  }

  async createConnectionPool(size: number): Promise<ConnectionPool> {
    // For web, return the native AsyncDuckDBConnectionPool
    // that is fully compatible with DuckDB WASM
    if (!this._db) {
      throw new InitializationError('Database not initialized');
    }
    const pool = new DuckDBWasmConnectionPool(this, { maxSize: size });
    await pool.initialize();
    return pool;
  }

  async registerFile(options: FileRegistration): Promise<void> {
    if (!this._db) {
      throw new InitializationError('Database not initialized');
    }

    if (options.type === 'file-handle' && options.handle) {
      let fileToRegister: File;

      if (isBrowserFile(options.handle)) {
        fileToRegister = options.handle;
      } else if (isFileSystemHandle(options.handle)) {
        fileToRegister = await options.handle.getFile();
      } else {
        throw new FileOperationError('Unsupported file handle type for registration', options.name);
      }

      await this._db.registerFileHandle(
        options.name,
        fileToRegister,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );
    } else if (options.type === 'url' && options.url) {
      await this._db.registerFileURL(
        options.name,
        options.url,
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
    } else {
      throw new FileOperationError(
        `Unsupported file registration type: ${options.type}`,
        options.name,
      );
    }

    this.registeredFiles.set(options.name, options);
  }

  async dropFile(name: string): Promise<void> {
    if (!this._db) {
      throw new InitializationError('Database not initialized');
    }
    await this._db.dropFile(name);
    this.registeredFiles.delete(name);
  }

  async listFiles(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    for (const [name, registration] of this.registeredFiles) {
      files.push({
        name,
        size: 0, // Size not readily available
        type: registration.type,
      });
    }
    return files;
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    const conn = await this.createConnection();
    try {
      return await conn.execute(sql, params);
    } finally {
      await conn.close();
    }
  }

  async *stream(sql: string, params?: any[]): AsyncGenerator<any> {
    const conn = await this.createConnection();
    try {
      yield* conn.stream(sql, params);
    } finally {
      await conn.close();
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    const conn = await this.createConnection();
    return await conn.prepare(sql);
  }

  async getCatalog(): Promise<CatalogInfo> {
    const result = await this.execute(
      'SELECT DISTINCT catalog_name FROM information_schema.schemata',
    );
    const databases = await Promise.all(
      result.rows.map(async (row) => {
        const dbName = row.catalog_name;
        const schemas = await this.execute(
          'SELECT schema_name FROM information_schema.schemata WHERE catalog_name = ?',
          [dbName],
        );
        return {
          name: dbName,
          schemas: schemas.rows.map((r) => r.schema_name),
        };
      }),
    );
    return { databases };
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const catalog = await this.getCatalog();
    return catalog.databases;
  }

  async getTables(database: string): Promise<TableInfo[]> {
    const result = await this.execute(
      `SELECT table_schema, table_name, table_type
       FROM information_schema.tables
       WHERE table_catalog = ?`,
      [database],
    );

    return result.rows.map((row) => ({
      database,
      schema: row.table_schema,
      name: row.table_name,
      type: row.table_type.toLowerCase() === 'view' ? 'view' : 'table',
    }));
  }

  async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.execute(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_catalog = ? AND table_name = ?`,
      [database, table],
    );

    return result.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
    }));
  }

  async checkpoint(): Promise<void> {
    await this.execute('CHECKPOINT');
  }

  async loadExtension(name: string, _options?: ExtensionOptions): Promise<void> {
    const conn = await this.createConnection();
    try {
      // For community extensions like gsheets, we need to specify the source
      if (name === 'gsheets' || name === 'read_stat') {
        await conn.execute(`INSTALL ${name} FROM community`);
      } else {
        await conn.execute(`INSTALL ${name}`);
      }
      await conn.execute(`LOAD ${name}`);
    } finally {
      await conn.close();
    }
  }

  async listExtensions(): Promise<ExtensionInfo[]> {
    const result = await this.execute('SELECT * FROM duckdb_extensions()');
    return result.rows.map((row) => ({
      name: row.extension_name,
      loaded: row.loaded === true,
      version: row.extension_version,
    }));
  }

  getCapabilities(): EngineCapabilities {
    return {
      supportsStreaming: true,
      supportsMultiThreading: this.isCrossOriginIsolated(),
      supportsDirectFileAccess: 'showOpenFilePicker' in window,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB browser limit
      supportedFileFormats: ['csv', 'parquet', 'json', 'xlsx'],
      supportedExtensions: ['httpfs', 'postgres_scanner'],
    };
  }

  private isCrossOriginIsolated(): boolean {
    return typeof window !== 'undefined' && window.crossOriginIsolated === true;
  }

  transformResult(result: any): QueryResult {
    const rows = result.toArray();
    const { schema } = result;

    const columns: ColumnInfo[] = schema.fields.map((field: any) => ({
      name: field.name,
      type: field.type.toString(),
      nullable: field.nullable || false,
    }));

    return {
      rows,
      columns,
      rowCount: rows.length,
    };
  }
}
