import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';

import { ConnectionPool, QueryResult } from './types';

/**
 * Adapter that wraps our generic ConnectionPool to be compatible with
 * the existing AsyncDuckDBConnectionPool interface used throughout the app
 */
export class ConnectionPoolAdapter extends AsyncDuckDBConnectionPool {
  private pool: ConnectionPool;
  private changeCount = 0;
  private updateCallback?: () => Promise<void>;

  constructor(pool: ConnectionPool, updatePersistenceCallback?: () => Promise<void>) {
    // Pass null for the db parameter since we won't use it
    super(null as any, 1, updatePersistenceCallback);
    this.pool = pool;
    this.updateCallback = updatePersistenceCallback;
  }

  async query<_T = any>(sql: string): Promise<any> {
    const conn = await this.pool.acquire();
    try {
      const result = await conn.execute(sql);

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
      return this.convertToDuckDBTable(result);
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
      toArray: () => result.rows as T[],
      getChildAt: (index: number) => {
        // Return column data
        const columnName = result.columns[index].name;
        return result.rows.map((row) => row[columnName]);
      },
      numCols: result.columns.length,
      numRows: result.rowCount,
    };

    return table;
  }
}
