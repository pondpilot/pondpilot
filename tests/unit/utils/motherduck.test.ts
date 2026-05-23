import { describe, expect, it, jest } from '@jest/globals';
import { attachAllMotherDuckDatabases, withMotherDuckConnection } from '@utils/motherduck';

jest.mock('@utils/duckdb/identifier', () => ({
  toDuckDBIdentifier: jest.fn((str: string) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str) ? str : `"${str.replace(/"/g, '""')}"`,
  ),
}));

type FakeQuery = (sql: string) => Promise<{ toArray: () => unknown[] }>;

function makePool(memoryPresent: boolean) {
  const calls: string[] = [];
  const query = jest.fn<FakeQuery>(async (sql: string) => {
    calls.push(sql);
    if (sql.includes("database_name = 'memory'")) {
      return { toArray: () => (memoryPresent ? [{ ok: 1 }] : []) };
    }
    return { toArray: () => [] };
  });
  const close = jest.fn<() => Promise<void>>(async () => {});
  const conn = { query, close };
  const getBackgroundConnection = jest.fn(async () => conn);
  const pool = { getBackgroundConnection } as any;
  return { pool, conn, calls, getBackgroundConnection, close };
}

describe('withMotherDuckConnection', () => {
  it('detaches the memory catalog around the sequence and restores it, on one connection', async () => {
    const { pool, calls, getBackgroundConnection, close } = makePool(true);

    const result = await withMotherDuckConnection(pool, async (conn) => {
      await conn.query('LIST_MD');
      return 'done';
    });

    expect(result).toBe('done');
    // The whole sequence runs on a single pooled connection.
    expect(getBackgroundConnection).toHaveBeenCalledTimes(1);
    // memory is detached before the MotherDuck work and restored afterward.
    expect(calls).toEqual([
      "SELECT 1 FROM duckdb_databases() WHERE database_name = 'memory'",
      'USE pondpilot;',
      'DETACH memory;',
      'LIST_MD',
      "ATTACH IF NOT EXISTS ':memory:' AS memory;",
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('skips detach/restore when no memory catalog is attached', async () => {
    const { pool, calls, close } = makePool(false);

    await withMotherDuckConnection(pool, async (conn) => {
      await conn.query('LIST_MD');
    });

    expect(calls).toEqual([
      "SELECT 1 FROM duckdb_databases() WHERE database_name = 'memory'",
      'LIST_MD',
    ]);
    expect(calls).not.toContain('DETACH memory;');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('restores the memory catalog and releases the connection even if the sequence throws', async () => {
    const { pool, calls, close } = makePool(true);

    await expect(
      withMotherDuckConnection(pool, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // memory is restored and the connection released despite the failure.
    expect(calls).toContain("ATTACH IF NOT EXISTS ':memory:' AS memory;");
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('attachAllMotherDuckDatabases', () => {
  it('enumerates every account database and attaches each (ATTACH md: only auto-attaches the default)', async () => {
    const calls: string[] = [];
    const query = jest.fn<FakeQuery>(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('md_information_schema.databases')) {
        // Includes entries that must be filtered out (the info schema, empty).
        return {
          toArray: () => [
            { name: 'my_db' },
            { name: 'pp_db2' },
            { name: 'md_information_schema' },
            { name: '' },
          ],
        };
      }
      return { toArray: () => [] };
    });

    const names = await attachAllMotherDuckDatabases({ query } as any);

    expect(names).toEqual(['my_db', 'pp_db2']);
    expect(calls).toContain("ATTACH IF NOT EXISTS 'md:my_db'");
    expect(calls).toContain("ATTACH IF NOT EXISTS 'md:pp_db2'");
    expect(calls).not.toContain("ATTACH IF NOT EXISTS 'md:md_information_schema'");
  });

  it('falls back to the attached set when the account catalog cannot be read', async () => {
    const query = jest.fn<FakeQuery>(async (sql: string) => {
      if (sql.includes('md_information_schema.databases')) {
        throw new Error('catalog unavailable');
      }
      // listMotherDuckDatabases (attached-only) fallback.
      return { toArray: () => [{ database_name: 'my_db', type: 'motherduck' }] };
    });

    const names = await attachAllMotherDuckDatabases({ query } as any);

    expect(names).toEqual(['my_db']);
  });
});
