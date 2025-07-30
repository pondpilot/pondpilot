import * as duckdb from '@duckdb/duckdb-wasm';
import { v4 as uuidv4 } from 'uuid';

import { DuckDBWasmConnection } from './duckdb-wasm-connection';
import { DuckDBWasmConnectionPool } from './duckdb-wasm-connection-pool';
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
  ExportFormat,
  ExtensionOptions,
  ExtensionInfo,
} from './types';

export class DuckDBWasmEngine implements DatabaseEngine {
  private worker: Worker | null = null;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger;
  private bundles: duckdb.DuckDBBundles;
  private ready = false;
  private config: EngineConfig | null = null;
  private registeredFiles: Map<string, FileRegistration> = new Map();

  constructor() {
    this.logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    this.bundles = duckdb.getJsDelivrBundles();
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
      this.db = new duckdb.AsyncDuckDB(this.logger, this.worker);

      // Instantiate DuckDB
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

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

      await this.db.open(dbConfig);

      // Workaround for OPFS write mode issue
      if (config.storageType === 'persistent') {
        const conn = await this.db.connect();
        const tempTable = `temp_${uuidv4().replace(/-/g, '_')}`;
        await conn.query(`CREATE OR REPLACE TABLE ${tempTable} AS SELECT 1;`);
        await conn.query(`DROP TABLE ${tempTable};`);
        await conn.close();
      }

      // Load extensions if specified
      for (const ext of config.extensions || []) {
        await this.loadExtension(ext);
      }

      this.ready = true;
    } catch (error) {
      throw new Error(`Failed to initialize DuckDB WASM: ${error}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.db = null;
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async createConnection(): Promise<DatabaseConnection> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const conn = await this.db.connect();
    return new DuckDBWasmConnection(uuidv4(), conn, this);
  }

  async createConnectionPool(size: number): Promise<ConnectionPool> {
    const pool = new DuckDBWasmConnectionPool(this, size);
    await pool.initialize();
    return pool;
  }

  async registerFile(options: FileRegistration): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (options.type === 'file-handle' && options.handle) {
      await this.db.registerFileHandle(
        options.name,
        options.handle,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );
    } else if (options.type === 'url' && options.url) {
      await this.db.registerFileURL(
        options.name,
        options.url,
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
    } else {
      throw new Error(`Unsupported file registration type: ${options.type}`);
    }

    this.registeredFiles.set(options.name, options);
  }

  async dropFile(name: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.dropFile(name);
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

  async* stream(sql: string, params?: any[]): AsyncGenerator<any> {
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

  async export(format: ExportFormat): Promise<ArrayBuffer | string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    switch (format) {
      case 'arrow':
        // Export via query for now
        throw new Error('Arrow export not yet implemented');
      default:
        throw new Error(`Export format ${format} not supported in WASM mode`);
    }
  }

  async import(_data: ArrayBuffer | string, _format: ExportFormat): Promise<void> {
    throw new Error('Import not yet implemented for DuckDB WASM');
  }

  async loadExtension(name: string, _options?: ExtensionOptions): Promise<void> {
    const conn = await this.createConnection();
    try {
      await conn.execute(`INSTALL ${name}`);
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
