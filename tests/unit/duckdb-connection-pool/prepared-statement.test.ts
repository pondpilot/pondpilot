import type { AsyncPreparedStatement } from '@duckdb/duckdb-wasm';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AsyncDuckDBPooledConnection } from '@services/duckdb-pool/duckdb-pooled-connection';
import { AsyncDuckDBPooledPreparedStatement } from '@services/duckdb-pool/duckdb-pooled-prepared-stmt';
import type * as arrow from 'apache-arrow';

describe('AsyncDuckDBPooledPreparedStatement', () => {
  let query: jest.Mock<(...params: unknown[]) => Promise<arrow.Table>>;
  let statement: AsyncDuckDBPooledPreparedStatement;

  beforeEach(() => {
    query = jest.fn(async () => ({}) as arrow.Table);
    statement = new AsyncDuckDBPooledPreparedStatement({
      conn: {} as AsyncDuckDBPooledConnection,
      stmt: { query } as unknown as AsyncPreparedStatement,
      onClose: async () => {},
    });
  });

  it('forwards scalar parameters using DuckDB-WASM variadic semantics', async () => {
    await statement.query('ya29.test-token');

    expect(query).toHaveBeenCalledWith('ya29.test-token');
  });

  it('preserves multiple parameter positions', async () => {
    await statement.query('first', 2, true);

    expect(query).toHaveBeenCalledWith('first', 2, true);
  });
});
