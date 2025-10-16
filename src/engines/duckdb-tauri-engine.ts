import { getLogger } from './debug-logger';
import { InitializationError, parseTauriError } from './errors';
import { TAURI_ALLOWED_EXTENSIONS } from './extension-allowlist';
import { TauriConnectionPool } from './tauri-connection-pool';
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

const logger = getLogger('database:tauri-engine');

/**
 * DuckDB Tauri Engine for Tauri desktop applications
 * Communicates with Rust backend via IPC for native performance
 */
export class DuckDBTauriEngine implements DatabaseEngine {
  private invoke: any = null;
  private listen: any = null;
  private ready = false;
  private connectionPool: TauriConnectionPool | null = null;

  /**
   * Wrapper for Tauri invoke calls with proper error handling
   */
  private async invokeWithErrorHandling<T>(command: string, args?: any): Promise<T> {
    try {
      return await this.invoke(command, args);
    } catch (error) {
      throw parseTauriError(error);
    }
  }

  async initialize(config: EngineConfig): Promise<void> {
    try {
      logger.debug('DuckDBTauriEngine.initialize() starting...');
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      this.invoke = invoke;
      this.listen = listen;
      logger.debug('Tauri API imported successfully');

      // Get extensions to load from the store
      const { useExtensionManagementStore, waitForExtensionStoreHydration } = await import(
        '@store/extension-management'
      );
      await waitForExtensionStoreHydration();
      const activeExtensions = useExtensionManagementStore.getState().getActiveExtensions();
      const extensionsToLoad = activeExtensions.map((ext) => ({ name: ext.name, type: ext.type }));
      config.extensions = extensionsToLoad;

      // Initialize DuckDB in Rust backend with proper storage configuration
      logger.debug('Calling initialize_duckdb', { config });
      await this.invoke('initialize_duckdb', { config });
      logger.debug('initialize_duckdb completed successfully');

      // Note: The Rust backend should use config.storagePath to open a persistent database
      // file directly instead of in-memory, making the persistent file the main database

      this.ready = true;
      logger.info('DuckDBTauriEngine.initialize() completed successfully');
    } catch (e) {
      logger.error('DuckDBTauriEngine.initialize() failed', e);
      throw new InitializationError(
        e instanceof Error && e.message.includes('not available')
          ? 'Tauri API not available. This engine can only be used in a Tauri application.'
          : `Failed to initialize DuckDB Tauri engine: ${e instanceof Error ? e.message : String(e)}`,
        { originalError: e },
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
      throw new InitializationError('Engine not initialized');
    }

    const connId = await this.invoke('create_connection');
    const { TauriConnection } = await import('./tauri-connection');
    return new TauriConnection(this.invoke, connId);
  }

  async createConnectionPool(size: number): Promise<ConnectionPool> {
    if (!this.invoke) {
      throw new InitializationError('Engine not initialized');
    }

    this.connectionPool = new TauriConnectionPool(this.invoke, { maxSize: size });
    return this.connectionPool;
  }

  async registerFile(options: FileRegistration): Promise<void> {
    await this.invokeWithErrorHandling<void>('register_file', { options });
  }

  async dropFile(name: string): Promise<void> {
    await this.invokeWithErrorHandling<void>('drop_file', { name });
  }

  async listFiles(): Promise<FileInfo[]> {
    return this.invokeWithErrorHandling<FileInfo[]>('list_files');
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    return this.invokeWithErrorHandling<QueryResult>('execute_query', { sql, params });
  }

  async *stream(sql: string, _params?: any[]): AsyncGenerator<any> {
    // Use unified binary streaming with Arrow IPC
    //
    // NOTE: Behavioral difference from WASM:
    // - Tauri: Yields multiple Arrow Tables (batches as they arrive from backend)
    // - WASM: Yields a single Arrow Table (all results at once)
    // Both are type-compatible (AsyncGenerator<ArrowTable>), consumers just see N vs 1 yields
    const streamId = crypto.randomUUID();
    const { TauriArrowReader } = await import('./tauri-arrow-reader');

    const reader = new TauriArrowReader(streamId);
    await reader.waitForInit();
    await this.invoke('stream_query', { streamId, sql });

    try {
      // Forward Arrow Table batches as they arrive
      for await (const batch of reader) {
        yield batch; // Yield Arrow Table batch
      }
    } finally {
      // Ensure we cancel/cleanup if consumer stops early
      if (!reader.closed && !reader.done) {
        await reader.cancel().catch(() => undefined);
      }
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    const stmtId = await this.invokeWithErrorHandling<string>('prepare_statement', { sql });

    return {
      id: stmtId,
      query: async (params?: any[]) => {
        return await this.invokeWithErrorHandling('prepared_statement_execute', {
          statementId: stmtId,
          params: params || [],
        });
      },
      close: async () => {
        await this.invokeWithErrorHandling('prepared_statement_close', {
          statementId: stmtId,
        });
      },
    };
  }

  async getCatalog(): Promise<CatalogInfo> {
    return this.invokeWithErrorHandling<CatalogInfo>('get_catalog');
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    return this.invokeWithErrorHandling<DatabaseInfo[]>('get_databases');
  }

  async getTables(database: string): Promise<TableInfo[]> {
    return this.invokeWithErrorHandling<TableInfo[]>('get_tables', { database });
  }

  async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
    return this.invokeWithErrorHandling<ColumnInfo[]>('get_columns', { database, table });
  }

  async checkpoint(): Promise<void> {
    await this.invokeWithErrorHandling<void>('checkpoint');
  }

  // Database import/export is not exposed in desktop API

  async loadExtension(name: string, _options?: ExtensionOptions): Promise<void> {
    await this.invoke('load_extension', { name, options: _options });
  }

  async listExtensions(): Promise<ExtensionInfo[]> {
    return this.invoke('list_extensions');
  }

  async getXlsxSheetNames(filePath: string): Promise<string[]> {
    // Send both keys to be robust against param naming differences
    return this.invoke('get_xlsx_sheet_names', { file_path: filePath, filePath });
  }

  getCapabilities(): EngineCapabilities {
    const allowed = TAURI_ALLOWED_EXTENSIONS;
    return {
      supportsStreaming: true,
      supportsMultiThreading: true,
      supportsDirectFileAccess: true,
      supportsExtensions: true,
      supportsPersistence: true,
      supportsRemoteFiles: true,
      maxFileSize: undefined,
      supportedFileFormats: ['csv', 'parquet', 'json', 'xlsx', 'arrow'],
      supportedExtensions: allowed,
    };
  }
}
