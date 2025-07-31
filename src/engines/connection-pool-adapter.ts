import { ConnectionPool, QueryResult, DatabaseConnection } from './types';

/**
 * Adapter that wraps our generic ConnectionPool to be compatible with
 * the existing AsyncDuckDBConnectionPool interface used throughout the app
 */
export class ConnectionPoolAdapter {
  private pool: ConnectionPool;
  private changeCount = 0;
  private updateCallback?: () => Promise<void>;

  // Mock bindings object for compatibility with existing code
  public bindings = {
    dropFile: async (fileName: string) => {
      // For Tauri, we don't need to drop files as they're accessed by path
      console.log('dropFile called for:', fileName);
    },
    registerFileHandle: async (fileName: string, file: File, protocol: any, replace: boolean) => {
      // For Tauri, we don't need to register file handles as files are accessed by path
      console.log('registerFileHandle called for:', fileName);
    },
  };

  constructor(pool: ConnectionPool, updatePersistenceCallback?: () => Promise<void>) {
    this.pool = pool;
    this.updateCallback = updatePersistenceCallback;
  }

  async query<_T = any>(sql: string): Promise<any> {
    console.log('ConnectionPoolAdapter.query() called with SQL:', sql);

    const conn = await this.pool.acquire();
    console.log('Acquired connection:', conn.constructor.name);

    try {
      console.log('Executing SQL query...');
      const result = await conn.execute(sql);
      console.log('Query result:', result);

      // Check if this was a write operation
      const trimmedSql = sql.trim().toUpperCase();
      if (this.isWriteOperation(trimmedSql)) {
        this.changeCount += 1;

        // Trigger checkpoint after certain number of changes
        if (this.changeCount >= 100 && this.updateCallback) {
          try {
            // The checkpoint would be handled by the engine
            await this.updateCallback();
            this.changeCount = 0;
          } catch (e) {
            console.warn('Failed to update persistence state:', e);
          }
        }
      }

      // Convert our QueryResult to DuckDB Table format
      const converted = this.convertToDuckDBTable(result);
      console.log('Converted result:', converted);
      return converted;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    } finally {
      await this.pool.release(conn);
    }
  }

  async queryWithoutRelease<_T = any>(
    sql: string,
  ): Promise<{
    result: any;
    release: () => Promise<void>;
  }> {
    const conn = await this.pool.acquire();
    const result = await conn.execute(sql);

    return {
      result: this.convertToDuckDBTable(result),
      release: async () => {
        await this.pool.release(conn);
      },
    };
  }

  async dispose(): Promise<void> {
    await this.pool.destroy();
  }

  getPoolSize(): number {
    return this.pool.size();
  }

  getAvailableConnections(): number {
    return this.pool.available();
  }

  async getPooledConnection(): Promise<PooledConnectionAdapter> {
    const conn = await this.pool.acquire();
    return new PooledConnectionAdapter(conn, async () => {
      await this.pool.release(conn);
    });
  }

  async queryAbortable<T = any>(
    sql: string,
    signal: AbortSignal,
  ): Promise<{ value: any; aborted: false } | { value: void; aborted: true }> {
    console.log('ConnectionPoolAdapter.queryAbortable() called with SQL:', sql);

    if (signal.aborted) {
      return { value: undefined as any, aborted: true };
    }

    const conn = await this.pool.acquire();
    console.log('Acquired connection for abortable query:', conn.constructor.name);

    try {
      // Check if aborted before executing
      if (signal.aborted) {
        return { value: undefined as any, aborted: true };
      }

      console.log('Executing abortable SQL query...');
      const result = await conn.execute(sql);
      console.log('Abortable query result:', result);

      // Check if this was a write operation
      const trimmedSql = sql.trim().toUpperCase();
      if (this.isWriteOperation(trimmedSql)) {
        this.changeCount++;
        console.log(`Write operation detected. Change count: ${this.changeCount}`);

        // Trigger persistence update if threshold reached
        if (this.changeCount >= 10 && this.updateCallback) {
          console.log('Change threshold reached, triggering persistence update');
          this.changeCount = 0;
          // Run update asynchronously without blocking
          this.updateCallback().catch(console.error);
        }
      }

      // Convert our QueryResult to DuckDB Table format
      const converted = this.convertToDuckDBTable(result);
      console.log('Converted abortable result:', converted);
      return { value: converted, aborted: false };
    } catch (error) {
      console.error('Abortable query execution failed:', error);
      throw error;
    } finally {
      await this.pool.release(conn);
    }
  }

  async sendAbortable<T = any>(
    text: string,
    signal: AbortSignal,
    allowStreamResult?: boolean,
  ): Promise<StreamReaderAdapter<T> | null> {
    console.log('ConnectionPoolAdapter.sendAbortable() called with SQL:', text);

    const conn = await this.pool.acquire();

    try {
      // For now, execute the query normally (not streaming)
      // TODO: Add proper streaming support when needed
      const result = await conn.execute(text);

      // Check if aborted
      if (signal.aborted) {
        await this.pool.release(conn);
        return null;
      }

      return new StreamReaderAdapter(result, async () => {
        await this.pool.release(conn);
      });
    } catch (error) {
      await this.pool.release(conn);
      throw error;
    }
  }

  private isWriteOperation(sql: string): boolean {
    return (
      sql.startsWith('CREATE') ||
      sql.startsWith('INSERT') ||
      sql.startsWith('UPDATE') ||
      sql.startsWith('DELETE') ||
      sql.startsWith('DROP') ||
      sql.startsWith('ALTER') ||
      sql.startsWith('COPY') ||
      sql.startsWith('CHECKPOINT')
    );
  }

  private convertToDuckDBTable<_T = any>(result: QueryResult): any {
    // Create a mock DuckDB Table object that matches the interface
    const table = {
      schema: {
        fields: result.columns.map((col) => ({
          name: col.name,
          type: { toString: () => col.type },
          nullable: col.nullable || false,
        })),
      },
      toArray: () => result.rows as _T[],
      getChild: (columnName: string) => {
        // Return column data by name with Vector-like interface
        const columnData = result.rows.map((row) => row[columnName]);
        return {
          get: (rowIndex: number) => columnData[rowIndex],
          toArray: () => columnData,
          length: columnData.length,
          *[Symbol.iterator]() {
            for (const value of columnData) {
              yield value;
            }
          },
        };
      },
      getChildAt: (index: number) => {
        // Return column data by index as a Vector-like object
        const columnName = result.columns[index].name;
        const columnData = result.rows.map((row) => row[columnName]);
        return {
          get: (rowIndex: number) => columnData[rowIndex],
          toArray: () => columnData,
          length: columnData.length,
          *[Symbol.iterator]() {
            for (const value of columnData) {
              yield value;
            }
          },
        };
      },
      numCols: result.columns.length,
      numRows: result.row_count || result.rowCount || result.rows.length,
    };

    return table;
  }
}

/**
 * Adapter for pooled connections that mimics AsyncDuckDBPooledConnection
 */
export class PooledConnectionAdapter {
  private conn: DatabaseConnection;
  private onCloseCallback: () => Promise<void>;
  private _closed = false;

  constructor(conn: DatabaseConnection, onClose: () => Promise<void>) {
    this.conn = conn;
    this.onCloseCallback = onClose;
  }

  get closed(): boolean {
    return this._closed;
  }

  async query<T = any>(sql: string): Promise<any> {
    if (this._closed) {
      throw new Error('Connection is closed');
    }

    console.log('PooledConnectionAdapter.query() called with SQL:', sql);
    const result = await this.conn.execute(sql);
    return this.convertToDuckDBTable(result);
  }

  async close(): Promise<void> {
    if (!this._closed) {
      this._closed = true;
      await this.onCloseCallback();
    }
  }

  async prepare(sql: string): Promise<any> {
    if (this._closed) {
      throw new Error('Connection is closed');
    }

    console.log('PooledConnectionAdapter.prepare() called with SQL:', sql);
    return await this.conn.prepare(sql);
  }

  // Mock method for compatibility - in real implementations this would analyze SQL
  getTableNames(sql: string): Promise<string[]> {
    console.log('PooledConnectionAdapter.getTableNames() called with SQL:', sql);
    // For now, return empty array - this would need proper SQL parsing
    return Promise.resolve([]);
  }

  private convertToDuckDBTable<_T = any>(result: QueryResult): any {
    // Same conversion logic as the main adapter
    const table = {
      schema: {
        fields: result.columns.map((col) => ({
          name: col.name,
          type: { toString: () => col.type },
          nullable: col.nullable || false,
        })),
      },
      toArray: () => result.rows as _T[],
      getChild: (columnName: string) => {
        const columnData = result.rows.map((row) => row[columnName]);
        return {
          get: (rowIndex: number) => columnData[rowIndex],
          toArray: () => columnData,
          length: columnData.length,
          *[Symbol.iterator]() {
            for (const value of columnData) {
              yield value;
            }
          },
        };
      },
      getChildAt: (index: number) => {
        const columnName = result.columns[index].name;
        const columnData = result.rows.map((row) => row[columnName]);
        return {
          get: (rowIndex: number) => columnData[rowIndex],
          toArray: () => columnData,
          length: columnData.length,
          *[Symbol.iterator]() {
            for (const value of columnData) {
              yield value;
            }
          },
        };
      },
      numCols: result.columns.length,
      numRows: result.row_count || result.rowCount || result.rows.length,
    };

    return table;
  }
}

/**
 * Adapter for stream readers that mimics AsyncDuckDBPooledStreamReader
 */
export class StreamReaderAdapter<T = any> {
  private result: QueryResult;
  private onCloseCallback: () => Promise<void>;
  private _closed = false;
  private currentIndex = 0;

  constructor(result: QueryResult, onClose: () => Promise<void>) {
    this.result = result;
    this.onCloseCallback = onClose;
  }

  get closed(): boolean {
    return this._closed;
  }

  async *readAll(): AsyncIterableIterator<any> {
    if (this._closed) {
      return;
    }

    try {
      // Yield all rows from the result
      for (const row of this.result.rows) {
        if (this._closed) {
          break;
        }
        yield row;
      }
    } finally {
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (!this._closed) {
      this._closed = true;
      await this.onCloseCallback();
    }
  }

  /**
   * Cancel the reader. This is an alias for `close()` to match AsyncDuckDBPooledStreamReader interface.
   */
  async cancel(): Promise<void> {
    await this.close();
  }

  /**
   * Iterate over batches in the stream, similar to AsyncDuckDBPooledStreamReader.
   * Since Tauri returns all data at once, we simulate streaming by yielding data in batches.
   */
  async next(): Promise<{ done: boolean; value: any }> {
    if (this._closed) {
      return { done: true, value: null };
    }

    // If we haven't started reading yet, convert all rows to Arrow-like format
    if (this.currentIndex === 0 && this.result.rows.length > 0) {
      // Create a mock Arrow RecordBatch-like object
      const recordBatch = {
        numRows: this.result.rows.length,
        numCols: this.result.columns.length,
        schema: {
          fields: this.result.columns.map((col) => ({
            name: col.name,
            type: { toString: () => col.type },
            nullable: col.nullable || false,
          })),
        },
        // Convert rows to columnar format with Vector-like interface
        getChildAt: (index: number) => {
          const columnName = this.result.columns[index].name;
          const columnData = this.result.rows.map((row) => row[columnName]);
          return {
            get: (rowIndex: number) => columnData[rowIndex],
            toArray: () => columnData,
            length: columnData.length,
            *[Symbol.iterator]() {
              for (const value of columnData) {
                yield value;
              }
            },
          };
        },
        toArray: () => this.result.rows,
      };

      this.currentIndex = this.result.rows.length;
      return { done: false, value: recordBatch };
    }

    // All data has been yielded, close and return done
    await this.close();
    return { done: true, value: null };
  }

  // Mock the Arrow table interface for compatibility
  toArray(): any[] {
    return this.result.rows;
  }

  get schema(): any {
    return {
      fields: this.result.columns.map((col) => ({
        name: col.name,
        type: { toString: () => col.type },
        nullable: col.nullable || false,
      })),
    };
  }

  get numRows(): number {
    return this.result.row_count || this.result.rowCount || this.result.rows.length;
  }

  get numCols(): number {
    return this.result.columns.length;
  }
}
