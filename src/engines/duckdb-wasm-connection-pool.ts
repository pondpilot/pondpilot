import { DuckDBWasmConnection } from './duckdb-wasm-connection';
import type { DuckDBWasmEngine } from './duckdb-wasm-engine';
import { ConnectionTimeoutError, PoolExhaustedError } from './errors';
import { PoolConfig, getOptimalPoolConfig } from './pool-config';
import { ConnectionPool, DatabaseConnection, PoolStats } from './types';

export class DuckDBWasmConnectionPool implements ConnectionPool {
  private connections: DuckDBWasmConnection[] = [];
  private availableConnections: DuckDBWasmConnection[] = [];
  private waitQueue: Array<{
    resolve: (conn: DuckDBWasmConnection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private config: PoolConfig;
  private lastValidation: number = Date.now();
  private stats = {
    connectionsCreated: 0,
    connectionsDestroyed: 0,
    acquireCount: 0,
    releaseCount: 0,
    timeoutCount: 0,
  };

  constructor(
    private engine: DuckDBWasmEngine,
    config?: Partial<PoolConfig>,
  ) {
    this.config = { ...getOptimalPoolConfig('duckdb-wasm'), ...config };
  }

  get bindings(): any {
    return this.engine.db;
  }

  async initialize(): Promise<void> {
    // Pre-create minimum connections
    for (let i = 0; i < this.config.minSize; i += 1) {
      const conn = await this.engine.createConnection();
      this.connections.push(conn as DuckDBWasmConnection);
      this.availableConnections.push(conn as DuckDBWasmConnection);
      this.stats.connectionsCreated += 1;
    }

    // Start idle connection cleanup timer
    if (this.config.idleTimeout > 0) {
      setInterval(() => this.cleanupIdleConnections(), this.config.idleTimeout / 2);
    }
  }

  async acquire(): Promise<DatabaseConnection> {
    this.stats.acquireCount += 1;

    // Clean up any timed out waiters
    this.cleanupTimedOutWaiters();

    // If we have available connections, validate and return one
    while (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;

      if (this.config.validateOnAcquire) {
        if (await this.validateConnection(conn)) {
          return conn;
        }
        // Connection is invalid, remove it
        this.removeConnection(conn);
        continue;
      }

      return conn;
    }

    // If we haven't reached max size, create a new connection
    if (this.connections.length < this.config.maxSize) {
      const conn = await this.engine.createConnection();
      this.connections.push(conn as DuckDBWasmConnection);
      this.stats.connectionsCreated += 1;
      return conn;
    }

    // Check if we've exceeded max waiting clients
    if (this.waitQueue.length >= this.config.maxWaitingClients) {
      throw new PoolExhaustedError(this.config.maxSize, { connectionId: 'pool-exhausted' });
    }

    // Otherwise, wait for a connection to be released
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
    const conn = connection as DuckDBWasmConnection;

    this.stats.releaseCount += 1;

    // If someone is waiting, give them the connection
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      waiter.resolve(conn);
    } else {
      // Otherwise, add it back to available pool
      this.availableConnections.push(conn);
    }
  }

  async query<T = any>(sql: string): Promise<T> {
    // Use the engine's db directly for compatibility with DuckDB WASM
    const { db } = this.engine;
    if (!db) {
      throw new Error('Database not initialized');
    }
    const conn = await db.connect();
    try {
      const result = await conn.query(sql);
      // For compatibility, return the arrow table directly
      return result as T;
    } finally {
      await conn.close();
    }
  }

  async queryAbortable<T = any>(
    sql: string,
    signal: AbortSignal,
  ): Promise<{ value: T; aborted: boolean }> {
    // Use the engine's db directly for compatibility with DuckDB WASM
    const { db } = this.engine;
    if (!db) {
      throw new Error('Database not initialized');
    }

    const conn = await db.connect();
    let aborted = false;

    // Set up abort handler
    const abortHandler = () => {
      aborted = true;
      conn.close().catch(() => {
        // Ignore close errors on abort
      });
    };

    signal.addEventListener('abort', abortHandler);

    try {
      const result = await conn.query(sql);
      return { value: result as T, aborted };
    } catch (error) {
      if (aborted || signal.aborted) {
        return { value: null as any, aborted: true };
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abortHandler);
      if (!aborted) {
        await conn.close();
      }
    }
  }

  async sendAbortable<T = any>(
    sql: string,
    signal: AbortSignal,
    stream?: boolean,
    _options?: any,
  ): Promise<T> {
    // Use the engine's db directly for compatibility with DuckDB WASM
    const { db } = this.engine;
    if (!db) {
      throw new Error('Database not initialized');
    }

    const conn = await db.connect();
    try {
      // eslint-disable-next-line no-console
      console.log('[WASM][sendAbortable] Connected', {
        streamRequested: !!stream,
        sqlLen: sql.length,
      });
    } catch {}
    let aborted = false;

    // Set up abort handler
    const abortHandler = async () => {
      aborted = true;
      try {
        // Cancel any in-flight streaming query
        await conn.cancelSent();
      } catch {
        // Ignore cancel errors
      }
      try {
        await conn.close();
      } catch {
        // Ignore close errors on abort
      }
      try {
        // eslint-disable-next-line no-console
        console.log('[WASM][sendAbortable] Abort handled: cancelSent + close');
      } catch {}
    };

    signal.addEventListener('abort', abortHandler);

    try {
      if (stream) {
        try {
          // eslint-disable-next-line no-console
          console.log('[WASM][sendAbortable] Starting stream via conn.send');
        } catch {}
        const reader = await conn.send(sql, true);

        // We need to keep the connection alive for the lifetime of the reader
        signal.removeEventListener('abort', abortHandler);

        // Wrap the reader to handle cleanup and parity with main
        let doneReached = false;
        let batchCount = 0;
        const wrappedReader = {
          async next() {
            if (aborted || doneReached) {
              return { done: true, value: undefined };
            }
            try {
              // eslint-disable-next-line no-console
              console.log('[WASM][sendAbortable] reader.next() ...');
              const res = await reader.next();
              batchCount += res.done ? 0 : 1;
              if (res.done || !res.value) {
                doneReached = true;
                try {
                  await conn.cancelSent();
                } catch {}
                try {
                  await conn.close();
                } catch {}
                try {
                  // eslint-disable-next-line no-console
                  console.log('[WASM][sendAbortable] reader done; batches read:', batchCount);
                } catch {}
                return { done: true, value: undefined };
              }
              try {
                // eslint-disable-next-line no-console
                console.log('[WASM][sendAbortable] batch received');
              } catch {}
              return res;
            } catch (error) {
              if (aborted) {
                return { done: true, value: undefined };
              }
              try {
                // eslint-disable-next-line no-console
                console.log('[WASM][sendAbortable] reader.next() error:', error);
              } catch {}
              throw error;
            }
          },
          async cancel() {
            aborted = true;
            try {
              await conn.cancelSent();
            } catch {}
            try {
              await conn.close();
            } catch {}
            try {
              // eslint-disable-next-line no-console
              console.debug('[WASM][sendAbortable] Reader cancelled');
            } catch {}
          },
          get closed() {
            return aborted || doneReached || reader.closed;
          },
        };

        return wrappedReader as T;
      }
      const result = await conn.query(sql);
      try {
        // eslint-disable-next-line no-console
        console.log('[WASM][sendAbortable] Non-stream query completed');
      } catch {}
      return result as T;
    } catch (error) {
      if (aborted) {
        try {
          // eslint-disable-next-line no-console
          console.log('[WASM][sendAbortable] Query aborted error passthrough');
        } catch {}
        throw new Error('Query aborted');
      }
      try {
        // eslint-disable-next-line no-console
        console.log('[WASM][sendAbortable] Error:', error);
      } catch {}
      throw error;
    } finally {
      // Only clean up if not streaming or if there was an error
      if (!stream || aborted) {
        signal.removeEventListener('abort', abortHandler);
        if (stmt && !stream) {
          await stmt.close();
        }
        await conn.close();
        try {
          // eslint-disable-next-line no-console
          console.log('[WASM][sendAbortable] Connection closed in finally');
        } catch {}
      }
    }
  }

  async close(): Promise<void> {
    // Close all connections
    const closePromises = this.connections.map((conn) => conn.close());
    await Promise.all(closePromises);

    // Clear arrays
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

  private async validateConnection(conn: DuckDBWasmConnection): Promise<boolean> {
    try {
      // Simple validation query
      await conn.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private removeConnection(conn: DuckDBWasmConnection): void {
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

  private cleanupIdleConnections(): void {
    // Keep at least minSize connections
    const excessConnections = this.availableConnections.length - this.config.minSize;

    if (excessConnections > 0) {
      // Remove excess idle connections
      const toRemove = this.availableConnections.splice(0, excessConnections);
      toRemove.forEach((conn) => this.removeConnection(conn));
    }
  }

  private cleanupTimedOutWaiters(): void {
    const now = Date.now();
    const timedOut = this.waitQueue.filter(
      (waiter) => now - waiter.timestamp > this.config.acquireTimeout,
    );

    timedOut.forEach((waiter) => {
      const index = this.waitQueue.indexOf(waiter);
      if (index !== -1) {
        this.waitQueue.splice(index, 1);
        this.stats.timeoutCount += 1;
        waiter.reject(new ConnectionTimeoutError(this.config.acquireTimeout));
      }
    });
  }

  size(): number {
    return this.connections.length;
  }

  available(): number {
    return this.availableConnections.length;
  }
}
