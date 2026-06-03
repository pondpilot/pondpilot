import { describe, expect, it, jest } from '@jest/globals';
import {
  attachAllMotherDuckDatabases,
  registerMotherDuckDatabaseAttaches,
  withMotherDuckConnection,
} from '@utils/motherduck';

jest.mock('@utils/duckdb/identifier', () => ({
  toDuckDBIdentifier: jest.fn((str: string) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str) ? str : `"${str.replace(/"/g, '""')}"`,
  ),
}));

type FakeQuery = (sql: string) => Promise<{ toArray: () => unknown[] }>;

function makePool() {
  const calls: string[] = [];
  const query = jest.fn<FakeQuery>(async (sql: string) => {
    calls.push(sql);
    return { toArray: () => [] };
  });
  const close = jest.fn<() => Promise<void>>(async () => {});
  const conn = { query, close };
  const getBackgroundConnection = jest.fn(async () => conn);
  const pool = { getBackgroundConnection } as any;
  return { pool, conn, calls, getBackgroundConnection, close };
}

describe('withMotherDuckConnection', () => {
  it('runs the sequence on a single pooled connection and releases it', async () => {
    const { pool, calls, getBackgroundConnection, close } = makePool();

    const result = await withMotherDuckConnection(pool, async (conn) => {
      await conn.query('LIST_MD');
      return 'done';
    });

    expect(result).toBe('done');
    // The whole sequence runs on a single pooled connection, released after.
    expect(getBackgroundConnection).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['LIST_MD', 'USE memory;']);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('never detaches the shared memory catalog', async () => {
    // Detaching `memory` is catalog-global on the shared DuckDB-WASM instance and
    // breaks every other pooled connection mid-query (it is their default
    // database). The sequence must leave it attached.
    const { pool, calls } = makePool();

    await withMotherDuckConnection(pool, async (conn) => {
      await conn.query('LIST_MD');
    });

    expect(calls).not.toContain('DETACH memory;');
    expect(calls).not.toContain("ATTACH IF NOT EXISTS ':memory:' AS memory;");
  });

  it('releases the connection even if the sequence throws', async () => {
    const { pool, calls, close } = makePool();

    await expect(
      withMotherDuckConnection(pool, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The connection is released despite the failure.
    expect(calls).toContain('USE memory;');
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

describe('registerMotherDuckDatabaseAttaches', () => {
  it('registers the MotherDuck handshake and each discovered database globally', () => {
    const registerGlobalAttach = jest.fn();
    const pool = { registerGlobalAttach } as any;

    registerMotherDuckDatabaseAttaches(pool, [
      'my_db',
      'pp_db2',
      "quote'db",
      '',
      'md_information_schema',
    ]);

    expect(registerGlobalAttach).toHaveBeenCalledTimes(4);
    expect(registerGlobalAttach).toHaveBeenNthCalledWith(1, 'md:', "ATTACH IF NOT EXISTS 'md:'");
    expect(registerGlobalAttach).toHaveBeenNthCalledWith(
      2,
      'my_db',
      "ATTACH IF NOT EXISTS 'md:my_db'",
    );
    expect(registerGlobalAttach).toHaveBeenNthCalledWith(
      3,
      'pp_db2',
      "ATTACH IF NOT EXISTS 'md:pp_db2'",
    );
    expect(registerGlobalAttach).toHaveBeenNthCalledWith(
      4,
      "quote'db",
      "ATTACH IF NOT EXISTS 'md:quote''db'",
    );
  });
});
