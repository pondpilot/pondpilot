import * as duckdb from '@duckdb/duckdb-wasm';
import { wrapQueryWithLimit } from '@utils/sql-wrapper';
import { v4 as uuidv4 } from 'uuid';

import type { DuckDBWasmEngine } from './duckdb-wasm-engine';
import { DatabaseConnection, PreparedStatement, QueryResult } from './types';

export class DuckDBWasmConnection implements DatabaseConnection {
  constructor(
    public readonly id: string,
    private conn: duckdb.AsyncDuckDBConnection,
    private engine: DuckDBWasmEngine,
  ) {}

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    // Wrap SELECT queries with a limit to prevent memory exhaustion
    const wrappedSql = wrapQueryWithLimit(sql);

    if (params && params.length > 0) {
      const stmt = await this.conn.prepare(wrappedSql);
      const result = await stmt.query(...params);
      stmt.close();
      return this.engine.transformResult(result);
    }
    const result = await this.conn.query(wrappedSql);
    return this.engine.transformResult(result);
  }

  async* stream(sql: string, params?: any[]): AsyncGenerator<any> {
    const result = await this.execute(sql, params);
    for (const row of result.rows) {
      yield row;
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    const stmt = await this.conn.prepare(sql);
    const { engine } = this;
    return {
      id: uuidv4(),
      async query(...params: any[]): Promise<QueryResult> {
        const result = await stmt.query(...params);
        return engine.transformResult(result);
      },
      async close(): Promise<void> {
        stmt.close();
      },
    };
  }

  async close(): Promise<void> {
    await this.conn.close();
  }

  isOpen(): boolean {
    // DuckDB-WASM doesn't expose connection state directly
    // We'll track this internally if needed
    return true;
  }
}
