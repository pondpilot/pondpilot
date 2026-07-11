import { describe, expect, it, jest } from '@jest/globals';

import { hasDatabaseObjects } from '../../../../src/controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '../../../../src/services/duckdb-pool/duckdb-connection-pool';

describe('hasDatabaseObjects', () => {
  it.each([true, false])('returns %s from the lightweight catalog query', async (hasObjects) => {
    const get = jest.fn(() => hasObjects);
    const query = jest.fn(async (_sql: string) => ({
      getChild: jest.fn(() => ({ get })),
    }));
    const conn = { query } as unknown as AsyncDuckDBConnectionPool;

    await expect(hasDatabaseObjects(conn, 'pondpilot', 'main')).resolves.toBe(hasObjects);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM duckdb_tables');
    expect(sql).toContain('FROM duckdb_views');
    expect(sql).toContain("database_name = 'pondpilot'");
    expect(sql).toContain("schema_name = 'main'");
    expect(sql).not.toContain('duckdb_columns');
  });

  it('treats a missing result column as empty', async () => {
    const conn = {
      query: jest.fn(async () => ({ getChild: jest.fn(() => null) })),
    } as unknown as AsyncDuckDBConnectionPool;

    await expect(hasDatabaseObjects(conn, 'pondpilot', 'main')).resolves.toBe(false);
  });
});
