import { ConnectionTimeoutError, PoolExhaustedError } from './errors';
import { PoolConfig, getOptimalPoolConfig } from './pool-config';
import { TauriConnection } from './tauri-connection';
import { ConnectionPool, DatabaseConnection, PoolStats } from './types';
import { DataType, Int32, Int64, Float32, Float64, Decimal, Utf8, Bool, DateDay, TimeMillisecond, TimestampMillisecond, IntervalDayTime, List, Struct, Binary, Field } from 'apache-arrow';

// Helper to map Tauri/DuckDB types to Arrow DataType objects
function mapTauriTypeToArrowType(typeName: string): DataType {
  // Normalize the type name
  const upperType = typeName.toUpperCase();
  
  // Map DuckDB types to Arrow DataType instances
  if (upperType.includes('BIGINT')) {
    return new Int64();
  } else if (upperType.includes('INT')) {
    return new Int32();
  } else if (upperType.includes('DOUBLE') || upperType.includes('FLOAT8')) {
    return new Float64();
  } else if (upperType.includes('REAL') || upperType.includes('FLOAT4') || upperType.includes('FLOAT')) {
    return new Float32();
  } else if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC')) {
    // Default precision and scale
    return new Decimal(18, 3);
  } else if (upperType.includes('VARCHAR') || upperType.includes('TEXT') || upperType.includes('STRING')) {
    return new Utf8();
  } else if (upperType.includes('BOOL')) {
    return new Bool();
  } else if (upperType.includes('DATE')) {
    return new DateDay();
  } else if (upperType.includes('TIME')) {
    return new TimeMillisecond();
  } else if (upperType.includes('TIMESTAMPTZ') || upperType.includes('TIMESTAMP WITH TIME ZONE')) {
    return new TimestampMillisecond('UTC');
  } else if (upperType.includes('TIMESTAMP')) {
    return new TimestampMillisecond();
  } else if (upperType.includes('INTERVAL')) {
    return new IntervalDayTime();
  } else if (upperType.includes('LIST') || upperType.includes('ARRAY')) {
    // Default to list of strings
    return new List(new Field('item', new Utf8(), true));
  } else if (upperType.includes('STRUCT')) {
    return new Struct([]);
  } else if (upperType.includes('BLOB') || upperType.includes('BINARY')) {
    return new Binary();
  } else {
    // Default to string for unknown types
    return new Utf8();
  }
}

// Helper to convert Tauri result to Arrow-like format
function convertTauriResultToArrowLike(result: any): any {
  if (!result || !result.columns || !result.rows) {
    return result;
  }

  // Create a mock Arrow table object with getChild method
  const table = {
    numRows: result.rows.length,
    rowCount: result.rows.length,
    numCols: result.columns.length,
    // Add schema for compatibility with Arrow table operations
    schema: {
      fields: result.columns.map((col: any, index: number) => {
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
          }
        };
      }),
    },
    getChild(columnName: string) {
      const columnIndex = result.columns.findIndex((col: any) => col.name === columnName);
      if (columnIndex === -1) {
        console.warn(`Column "${columnName}" not found in result columns:`, result.columns.map((c: any) => c.name));
        return null;
      }
      
      // Get column info for type data
      const columnInfo = result.columns[columnIndex];
      
      // Create a mock column vector
      const columnData = result.rows.map((row: any) => {
        const value = row[columnName];
        // Handle null values explicitly
        return value === null || value === undefined ? null : value;
      });
      
      const columnVector = {
        get(rowIndex: number) {
          if (rowIndex < 0 || rowIndex >= result.rows.length) {
            return null;
          }
          const value = result.rows[rowIndex][columnName];
          return value === null || value === undefined ? null : value;
        },
        toArray() {
          return columnData;
        },
        length: result.rows.length,
        // Add type information
        type: columnInfo.type_name || columnInfo.type || 'VARCHAR',
        nullable: columnInfo.nullable !== false,
        // Implement iterator protocol
        [Symbol.iterator]() {
          let index = 0;
          return {
            next() {
              if (index < columnData.length) {
                return { value: columnData[index++], done: false };
              }
              return { done: true, value: undefined };
            }
          };
        }
      };
      return columnVector;
    },
    getChildAt(index: number) {
      if (index < 0 || index >= result.columns.length) {
        console.warn(`Column index ${index} out of bounds. Total columns: ${result.columns.length}`);
        return null;
      }
      const columnName = result.columns[index].name;
      return this.getChild(columnName);
    },
    // Add column count method for compatibility
    getColumnCount() {
      return result.columns.length;
    },
    // Add method to get all column names
    getColumnNames() {
      return result.columns.map((col: any) => col.name);
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

  constructor(invoke: any, config?: Partial<PoolConfig>) {
    this.invoke = invoke;
    this.config = { ...getOptimalPoolConfig('duckdb-tauri'), ...config };
  }

  async acquire(): Promise<DatabaseConnection> {
    this.stats.acquireCount++;

    // If we have available connections, return one
    if (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;

      if (this.config.validateOnAcquire) {
        if (await this.validateConnection(conn)) {
          return conn;
        }
        // Connection is invalid, remove it
        this.removeConnection(conn);
        // Try again
        return this.acquire();
      }

      return conn;
    }

    // If we haven't reached max pool size, create a new connection
    if (this.connections.length < this.config.maxSize) {
      const connId = await this.invoke('create_connection');
      const conn = new TauriConnection(this.invoke, connId);
      this.connections.push(conn);
      this.stats.connectionsCreated++;
      return conn;
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
          this.stats.timeoutCount++;
          reject(new ConnectionTimeoutError(this.config.acquireTimeout));
        }
      }, this.config.acquireTimeout);
    });
  }

  async release(connection: DatabaseConnection): Promise<void> {
    const tauriConn = connection as TauriConnection;
    this.stats.releaseCount++;

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
      // Convert Tauri result to Arrow-like format for compatibility
      return convertTauriResultToArrowLike(result) as T;
    } finally {
      await this.release(conn);
    }
  }

  async queryAbortable<T = any>(sql: string, signal: AbortSignal): Promise<{ value: T; aborted: boolean }> {
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
        return { value: null as any, aborted: true };
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abortHandler);
      await this.release(conn);
    }
  }

  async sendAbortable<T = any>(sql: string, signal: AbortSignal, stream?: boolean): Promise<T> {
    if (stream) {
      // For streaming, return a reader-compatible object that reads all at once
      const conn = await this.acquire();
      let resultData: any = null;
      let done = false;
      let cancelled = false;
      
      // Execute the query immediately to get the data
      const executeQuery = async () => {
        try {
          const result = await conn.execute(sql);
          // Convert to Arrow-like format for compatibility
          resultData = convertTauriResultToArrowLike(result);
          await this.release(conn);
        } catch (error) {
          await this.release(conn);
          throw error;
        }
      };
      
      // Start executing but don't wait
      const queryPromise = executeQuery();
      
      const reader = {
        async next() {
          if (cancelled || done) {
            return { done: true, value: undefined };
          }
          
          // Wait for the query to complete
          await queryPromise;
          
          // Return all data at once
          done = true;
          return { done: false, value: resultData };
        },
        async cancel() {
          cancelled = true;
          // Can't actually cancel the query in Tauri
        },
        get closed() {
          return done || cancelled;
        }
      };
      
      return reader as T;
    } else {
      // Non-streaming query
      const conn = await this.acquire();
      
      try {
        const result = await conn.execute(sql);
        // Convert to Arrow-like format for compatibility
        return convertTauriResultToArrowLike(result) as T;
      } finally {
        await this.release(conn);
      }
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
      this.stats.connectionsDestroyed++;
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
