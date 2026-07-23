import { describe, expect, it, jest } from '@jest/globals';

import { getViewDefinitions, hasDatabaseObjects } from '../../../../src/controllers/db/duckdb-meta';
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

describe('getViewDefinitions', () => {
  it('returns view names and SQL for migration decisions', async () => {
    const columns = {
      view_name: { get: (index: number) => ['public_sheet', 'private_sheet'][index] },
      sql: {
        get: (index: number) =>
          [
            "CREATE VIEW public_sheet AS SELECT * FROM read_csv('export?format=csv')",
            'CREATE VIEW private_sheet AS SELECT * FROM read_gsheet(...)',
          ][index],
      },
    };
    const query = jest.fn(async (_sql: string) => ({
      numRows: 2,
      getChild: (name: keyof typeof columns) => columns[name],
    }));
    const conn = { query } as unknown as AsyncDuckDBConnectionPool;

    await expect(getViewDefinitions(conn, 'pondpilot', 'main')).resolves.toEqual(
      new Map([
        ['public_sheet', "CREATE VIEW public_sheet AS SELECT * FROM read_csv('export?format=csv')"],
        ['private_sheet', 'CREATE VIEW private_sheet AS SELECT * FROM read_gsheet(...)'],
      ]),
    );
  });
});
