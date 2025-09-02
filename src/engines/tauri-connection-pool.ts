import { tauriLog } from '@utils/tauri-logger';
import {
  DataType,
  Int32,
  Int64,
  Float32,
  Float64,
  Decimal,
  Utf8,
  Bool,
  DateDay,
  TimeMillisecond,
  TimestampMillisecond,
  IntervalDayTime,
  List,
  Struct,
  Binary,
  Field,
} from 'apache-arrow';

import { ConnectionTimeoutError, PoolExhaustedError } from './errors';
import { PoolConfig, getOptimalPoolConfig } from './pool-config';
import { TauriArrowReader } from './tauri-arrow-reader';
import { TauriConnection } from './tauri-connection';
import { ConnectionPool, DatabaseConnection, PoolStats } from './types';

// Helper to map Tauri/DuckDB types to Arrow DataType objects
function mapTauriTypeToArrowType(typeName: string): DataType {
  // Normalize the type name
  const upperType = typeName.toUpperCase();

  // Map DuckDB types to Arrow DataType instances
  if (upperType.includes('BIGINT')) {
    return new Int64();
  }
  if (upperType.includes('INT')) {
    return new Int32();
  }
  if (upperType.includes('DOUBLE') || upperType.includes('FLOAT8')) {
    return new Float64();
  }
  if (upperType.includes('REAL') || upperType.includes('FLOAT4') || upperType.includes('FLOAT')) {
    return new Float32();
  }
  if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC')) {
    // Default precision and scale
    return new Decimal(18, 3);
  }
  if (upperType.includes('VARCHAR') || upperType.includes('TEXT') || upperType.includes('STRING')) {
    return new Utf8();
  }
  if (upperType.includes('BOOL')) {
    return new Bool();
  }
  if (upperType.includes('DATE')) {
    return new DateDay();
  }
  if (upperType.includes('TIME')) {
    return new TimeMillisecond();
  }
  if (upperType.includes('TIMESTAMPTZ') || upperType.includes('TIMESTAMP WITH TIME ZONE')) {
    return new TimestampMillisecond('UTC');
  }
  if (upperType.includes('TIMESTAMP')) {
    return new TimestampMillisecond();
  }
  if (upperType.includes('INTERVAL')) {
    return new IntervalDayTime();
  }
  if (upperType.includes('LIST') || upperType.includes('ARRAY')) {
    // Default to list of strings
    return new List(new Field('item', new Utf8(), true));
  }
  if (upperType.includes('STRUCT')) {
    return new Struct([]);
  }
  if (upperType.includes('BLOB') || upperType.includes('BINARY')) {
    return new Binary();
  }
  // Default to string for unknown types
  return new Utf8();
}

/**
 * Converts Tauri query results to an Apache Arrow-compatible table structure.
 *
 * RATIONALE: The frontend components (data grid, export features, etc.) were originally
 * built to work with Apache Arrow tables from DuckDB-WASM. When we added the Tauri backend
 * for native performance, we needed to maintain API compatibility so existing UI components
 * would continue to work without modification.
 *
 * This function creates a "mock" Arrow table that implements the same interface as real
 * Arrow tables, including:
 * - getChild(columnName) to access column vectors
 * - schema with field definitions
 * - Iterator protocol for column data
 *
 * This allows us to use the same data visualization and manipulation code for both
 * web (DuckDB-WASM with real Arrow) and desktop (Tauri with simulated Arrow) modes.
 *
 * @param result Raw query result from Tauri backend with { columns, rows } structure
 * @returns Arrow-compatible table object that mimics apache-arrow Table API
 */
function convertTauriResultToArrowLike(result: any): any {
  // Debug log the raw result
  if (result && typeof result === 'object') {
    // console.log('[convertTauriResultToArrowLike] Raw result keys:', Object.keys(result));
    // console.log('[convertTauriResultToArrowLike] Has columns:', 'columns' in result);
    // console.log('[convertTauriResultToArrowLike] Has rows:', 'rows' in result);
    if ('rows' in result) {
      // console.log('[convertTauriResultToArrowLike] Rows length:', result.rows?.length);
    }
  }

  if (!result) {
    return result;
  }

  // Handle case where columns or rows might be undefined (empty result set)
  const columns = result.columns || [];
  const rows = result.rows || [];

  // console.log('[convertTauriResultToArrowLike] Columns:', columns);
  // console.log('[convertTauriResultToArrowLike] Rows count:', rows.length);

  // Create a mock Arrow table object that implements the Apache Arrow Table interface
  // This ensures compatibility with components expecting Arrow tables
  const table = {
    numRows: rows.length,
    rowCount: rows.length,
    numCols: columns.length,
    // Add schema for compatibility with Arrow table operations
    schema: {
      fields: columns.map((col: any, _index: number) => {
        // Map Tauri types to Arrow-like type objects
        const typeName = col.type_name || col.type || 'VARCHAR';
        const arrowType = mapTauriTypeToArrowType(typeName);

        return {
          name: col.name,
          type: arrowType,
          nullable: col.nullable !== false, // Default to nullable
          // Add metadata for better compatibility
          metadata: {
            type_name: typeName,
          },
        };
      }),
    },
    getChild(columnName: string) {
      const columnIndex = columns.findIndex((col: any) => col.name === columnName);
      if (columnIndex === -1) {
        // console.warn(
        //   `Column "${columnName}" not found in result columns:`,
        //   columns.map((c: any) => c.name),
        // );
        return null;
      }

      // Get column info for type data
      const columnInfo = columns[columnIndex];

      // Create a mock column vector
      const columnData = rows.map((row: any) => {
        const value = row[columnName];
        // Handle null values explicitly
        return value === null || value === undefined ? null : value;
      });

      const columnVector = {
        get(rowIndex: number) {
          if (rowIndex < 0 || rowIndex >= rows.length) {
            return null;
          }
          const value = rows[rowIndex][columnName];
          return value === null || value === undefined ? null : value;
        },
        toArray() {
          return columnData;
        },
        length: rows.length,
        // Add type information
        type: columnInfo.type_name || columnInfo.type || 'VARCHAR',
        nullable: columnInfo.nullable !== false,
        // Implement iterator protocol
        [Symbol.iterator]() {
          let index = 0;
          return {
            next() {
              if (index < columnData.length) {
                const value = columnData[index];
                index += 1;
                return { value, done: false };
              }
              return { done: true, value: undefined };
            },
          };
        },
      };
      return columnVector;
    },
    getChildAt(index: number) {
      if (index < 0 || index >= columns.length) {
        // console.warn(`Column index ${index} out of bounds. Total columns: ${columns.length}`);
        return null;
      }
      const columnName = columns[index].name;
      return this.getChild(columnName);
    },
    // Add column count method for compatibility
    getColumnCount() {
      return columns.length;
    },
    // Add method to get all column names
    getColumnNames() {
      return columns.map((col: any) => col.name);
    },
    // For compatibility with code expecting direct property access
    ...result,
  };

  return table;
}

export class TauriConnectionPool implements ConnectionPool {
  private connections: TauriConnection[] = [];
  private availableConnections: TauriConnection[] = [];
  private waitQueue: Array<{
    resolve: (conn: TauriConnection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private invoke: any;
  private config: PoolConfig;
  private stats = {
    connectionsCreated: 0,
    connectionsDestroyed: 0,
    acquireCount: 0,
    releaseCount: 0,
    timeoutCount: 0,
  };
  // Mutex to prevent race conditions during connection acquisition
  private acquireLock: Promise<void> = Promise.resolve();
  private acquireLockResolver: (() => void) | null = null;

  constructor(invoke: any, config?: Partial<PoolConfig>) {
    this.invoke = invoke;
    this.config = { ...getOptimalPoolConfig('duckdb-tauri'), ...config };

    // Pre-load the extension store to ensure it's hydrated before first use
    this.initializeExtensionStore();
  }

  private async initializeExtensionStore(): Promise<void> {
    try {
      const { waitForExtensionStoreHydration } = await import('../store/extension-management');
      await waitForExtensionStoreHydration();
    } catch (error) {
      // Ignore extension store initialization errors
    }
  }

  /**
   * Alias for acquire() for compatibility with other pool implementations
   */
  async getConnection(): Promise<DatabaseConnection> {
    return this.acquire();
  }

  /**
   * Initialize a connection with extensions and attachments
   */
  private async initializeConnection(conn: TauriConnection, isNew: boolean = false): Promise<void> {
    // Extension loading is handled centrally on the Tauri backend per-connection
    // to enforce security policy (allowlist) and avoid duplication. No-op here.
    conn.markExtensionsLoaded();

    // Load local DB attachments if not already loaded
    if (!conn.hasAttachedDbsLoaded()) {
      try {
        const { AttachmentLoader } = await import('../services/attachment-loader');
        await AttachmentLoader.loadLocalDBsForConnection(conn);
        conn.markAttachedDbsLoaded();
      } catch (error) {
        const logLevel = isNew ? 'error' : 'warn';
        // eslint-disable-next-line no-console
        console[logLevel](
          `Failed to attach local DBs for ${isNew ? 'new' : 'reused'} connection:`,
          error,
        );
      }
    }
  }

  async acquire(): Promise<DatabaseConnection> {
    this.stats.acquireCount += 1;

    // Wait for any ongoing acquire operations to complete
    await this.acquireLock;

    // Create a new lock for this acquire operation
    this.acquireLock = new Promise((resolve) => {
      this.acquireLockResolver = resolve;
    });

    try {
      // If we have available connections, return one
      if (this.availableConnections.length > 0) {
        const conn = this.availableConnections.pop()!;

        if (this.config.validateOnAcquire) {
          if (await this.validateConnection(conn)) {
            await this.initializeConnection(conn);
            return conn;
          }
          // Connection is invalid, remove it
          this.removeConnection(conn);
          // Try again (but release lock first)
          return await this.acquire();
        }

        await this.initializeConnection(conn);
        return conn;
      }

      // If we haven't reached max pool size, create a new connection
      if (this.connections.length < this.config.maxSize) {
        const connId = await this.invoke('create_connection');
        const conn = new TauriConnection(this.invoke, connId);
        this.connections.push(conn);
        this.stats.connectionsCreated += 1;

        await this.initializeConnection(conn, true);
        return conn;
      }
    } finally {
      // Release the lock
      if (this.acquireLockResolver) {
        this.acquireLockResolver();
        this.acquireLockResolver = null;
      }
    }

    // Check if we've exceeded max waiting clients
    if (this.waitQueue.length >= this.config.maxWaitingClients) {
      throw new PoolExhaustedError(this.config.maxSize, { connectionId: 'pool-exhausted' });
    }

    // Otherwise wait for a connection to become available
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.waitQueue.push(waiter);

      // Set up timeout
      setTimeout(() => {
        const index = this.waitQueue.indexOf(waiter);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          this.stats.timeoutCount += 1;
          reject(new ConnectionTimeoutError(this.config.acquireTimeout));
        }
      }, this.config.acquireTimeout);
    });
  }

  async release(connection: DatabaseConnection): Promise<void> {
    const tauriConn = connection as TauriConnection;
    this.stats.releaseCount += 1;

    if (!tauriConn.isOpen()) {
      // Connection is closed, remove it
      this.removeConnection(tauriConn);
      return;
    }

    // If someone is waiting, give them the connection
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      waiter.resolve(tauriConn);
    } else {
      // Otherwise, add it back to available pool
      this.availableConnections.push(tauriConn);
    }
  }

  async query<T = any>(sql: string): Promise<T> {
    const conn = await this.acquire();
    try {
      const result = await conn.execute(sql);
      // console.log('[TauriConnectionPool.query] Raw execute result:', result);
      // Convert Tauri result to Arrow-like format for compatibility
      return convertTauriResultToArrowLike(result) as T;
    } finally {
      await this.release(conn);
    }
  }

  async queryAbortable<T = any>(
    sql: string,
    signal: AbortSignal,
  ): Promise<{ value: T; aborted: boolean }> {
    const conn = await this.acquire();
    let aborted = false;

    // Set up abort handler
    const abortHandler = () => {
      aborted = true;
      // Tauri connections don't support immediate cancellation
      // but we can still track the abort state
    };

    signal.addEventListener('abort', abortHandler);

    try {
      const result = await conn.execute(sql);
      // Convert Tauri result to Arrow-like format for compatibility
      return { value: convertTauriResultToArrowLike(result) as T, aborted };
    } catch (error) {
      if (aborted || signal.aborted) {
        return { value: null as unknown as T, aborted: true };
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abortHandler);
      await this.release(conn);
    }
  }

  async sendAbortable<T = any>(
    sql: string,
    signal: AbortSignal,
    stream?: boolean,
    options?: {
      attach?: { dbName: string; url: string; readOnly?: boolean };
    },
  ): Promise<T> {
    if (stream) {
      // Use true Arrow streaming with binary IPC (no Base64 overhead!)
      const streamId = crypto.randomUUID();
      // console.log(`[TauriConnectionPool] Starting stream query with ID: ${streamId}`);

      // Use optimized Tauri binary events reader
      const reader = new TauriArrowReader(streamId);
      // console.log('[TauriConnectionPool] TauriArrowReader created');

      // Wait for listeners to be ready
      await reader.waitForInit();
      // console.log('[TauriConnectionPool] TauriArrowReader initialized');

      // NOW initiate streaming on backend
      tauriLog('[TauriConnectionPool] stream_query invoking with SQL:', sql);
      // Build default attachments for LocalDBs if not provided
      let attachSpec: any = options?.attach;
      if (!attachSpec) {
        try {
          const { useAppStore } = await import('../store/app-store');
          const { getFileReferenceForDuckDB } = await import(
            '../controllers/file-system/file-helpers'
          );
          const state = useAppStore.getState();
          const attaches: Array<{ dbName: string; url: string; readOnly: boolean }> = [];
          for (const ds of state.dataSources.values()) {
            if (ds.type === 'attached-db') {
              const entry = state.localEntries.get(ds.fileSourceId);
              if (entry && entry.kind === 'file' && entry.fileType === 'data-source') {
                const url = getFileReferenceForDuckDB(entry);
                attaches.push({ dbName: ds.dbName, url, readOnly: true });
              }
            } else if (ds.type === 'remote-db') {
              // Only attach remote databases that have a valid URL (legacy style)
              // Skip databases using connectionId (new style) - they're handled differently
              if (ds.legacyUrl && ds.legacyUrl.trim() !== '') {
                attaches.push({ dbName: ds.dbName, url: ds.legacyUrl, readOnly: true });
              }
            }
          }
          if (attaches.length > 0) {
            attachSpec = attaches;
          }
        } catch (e) {
          // Log the error for debugging but continue - stream may still run without auto-attachments
        }
      }

      try {
        // Always use the unified binary streaming command
        const authInfo = (await this.invoke('stream_query', {
          sql,
          streamId,
          attach: attachSpec,
        })) as { status: string };

        // Streaming initiated successfully
        if (authInfo && authInfo.status === 'streaming') {
          // Streaming has been initiated
        }
      } catch (err) {
        tauriLog('[TauriConnectionPool] stream_query invoke failed:', err);
        throw err;
      }
      // console.log('[TauriConnectionPool] stream_query invoked successfully');

      // Handle abort
      const abortHandler = () => {
        // console.log('[TauriConnectionPool] Abort signal received, cancelling reader');
        reader.cancel();
      };
      signal.addEventListener('abort', abortHandler, { once: true });

      return reader as T;
    }
    // Non-streaming query
    const conn = await this.acquire();

    try {
      tauriLog('[TauriConnectionPool] Executing SQL via non-stream:', sql);
      const result = await conn.execute(sql);
      // Convert to Arrow-like format for compatibility
      return convertTauriResultToArrowLike(result) as T;
    } finally {
      await this.release(conn);
    }
  }

  async close(): Promise<void> {
    // Close all connections
    await Promise.all(this.connections.map((conn) => conn.close()));
    this.connections = [];
    this.availableConnections = [];

    // Reject any waiters
    this.waitQueue.forEach((waiter) => {
      waiter.reject(new Error('Pool closed'));
    });
    this.waitQueue = [];
  }

  getStats(): PoolStats {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.connections.length - this.availableConnections.length,
      idleConnections: this.availableConnections.length,
      waitingRequests: this.waitQueue.length,
      ...this.stats,
    };
  }

  private async validateConnection(conn: TauriConnection): Promise<boolean> {
    try {
      // Simple validation query
      await conn.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private removeConnection(conn: TauriConnection): void {
    const index = this.connections.indexOf(conn);
    if (index !== -1) {
      this.connections.splice(index, 1);
      this.stats.connectionsDestroyed += 1;
    }

    const availIndex = this.availableConnections.indexOf(conn);
    if (availIndex !== -1) {
      this.availableConnections.splice(availIndex, 1);
    }

    // Close the connection
    conn.close().catch(() => {
      // Ignore close errors
    });
  }
}
