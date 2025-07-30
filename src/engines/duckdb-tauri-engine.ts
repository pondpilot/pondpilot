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
import { TauriConnectionPool } from './tauri-connection-pool';

/**
 * DuckDB Tauri Engine for Tauri desktop applications
 * Communicates with Rust backend via IPC for native performance
 */
export class DuckDBTauriEngine implements DatabaseEngine {
  private invoke: any = null;
  private listen: any = null;
  private ready = false;
  private connectionPool: TauriConnectionPool | null = null;

  async initialize(config: EngineConfig): Promise<void> {
    try {
      const tauriApi = await import('@tauri-apps/api' as any);
      this.invoke = tauriApi.invoke;
      this.listen = tauriApi.listen;

      // Initialize DuckDB in Rust backend
      await this.invoke('initialize_duckdb', { config });

      this.ready = true;
    } catch (e) {
      throw new Error(
        'Tauri API not available. This engine can only be used in a Tauri application.',
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.connectionPool) {
      await this.connectionPool.close();
    }
    if (this.invoke) {
      await this.invoke('shutdown_duckdb');
    }
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async createConnection(): Promise<DatabaseConnection> {
    if (!this.invoke) {
      throw new Error('Engine not initialized');
    }
    
    const connId = await this.invoke('create_connection');
    const { TauriConnection } = await import('./tauri-connection');
    return new TauriConnection(this.invoke, connId);
  }

  async createConnectionPool(size: number): Promise<ConnectionPool> {
    if (!this.invoke) {
      throw new Error('Engine not initialized');
    }
    
    this.connectionPool = new TauriConnectionPool(this.invoke, size);
    return this.connectionPool;
  }

  async registerFile(options: FileRegistration): Promise<void> {
    await this.invoke('register_file', { options });
  }

  async dropFile(name: string): Promise<void> {
    await this.invoke('drop_file', { name });
  }

  async listFiles(): Promise<FileInfo[]> {
    return this.invoke('list_files');
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    const result = await this.invoke('execute_query', { sql, params });
    return result;
  }

  async* stream(sql: string, params?: any[]): AsyncGenerator<any> {
    const streamId = crypto.randomUUID();
    const buffer: any[] = [];
    let done = false;
    
    // Set up listener first
    const unlisten = await this.listen(`stream-${streamId}`, (event: any) => {
      buffer.push(event.payload);
    });
    
    const unlistenEnd = await this.listen(`stream-${streamId}-end`, () => {
      done = true;
    });
    
    // Start streaming
    await this.invoke('stream_query', { streamId, sql, params: params || [] });
    
    // Yield results as they come
    try {
      while (!done || buffer.length > 0) {
        if (buffer.length > 0) {
          yield buffer.shift();
        } else {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      unlisten();
      unlistenEnd();
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    const stmtId = await this.invoke('prepare_statement', { sql });
    
    return {
      id: stmtId,
      query: async (params?: any[]) => {
        return this.invoke('prepared_statement_execute', {
          statementId: stmtId,
          params: params || [],
        });
      },
      close: async () => {
        await this.invoke('prepared_statement_close', {
          statementId: stmtId,
        });
      },
    };
  }

  async getCatalog(): Promise<CatalogInfo> {
    return this.invoke('get_catalog');
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    return this.invoke('get_databases');
  }

  async getTables(database: string): Promise<TableInfo[]> {
    return this.invoke('get_tables', { database });
  }

  async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
    return this.invoke('get_columns', { database, table });
  }

  async checkpoint(): Promise<void> {
    await this.invoke('checkpoint');
  }

  async export(format: ExportFormat): Promise<ArrayBuffer | string> {
    return this.invoke('export_database', { format });
  }

  async import(data: ArrayBuffer | string, format: ExportFormat): Promise<void> {
    await this.invoke('import_database', { data, format });
  }

  async loadExtension(name: string, _options?: ExtensionOptions): Promise<void> {
    await this.invoke('load_extension', { name, options: _options });
  }

  async listExtensions(): Promise<ExtensionInfo[]> {
    return this.invoke('list_extensions');
  }

  getCapabilities(): EngineCapabilities {
    return {
      supportsStreaming: true,
      supportsMultiThreading: true,
      supportsDirectFileAccess: true,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: undefined,
      supportedFileFormats: ['all'],
      supportedExtensions: ['all'],
    };
  }
}
