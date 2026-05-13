import { describe, expect, it, jest } from '@jest/globals';
import {
  attachQuackConnection,
  buildAttachQuackQuery,
  buildCreateQuackSecretQuery,
  getQuackDatabaseModel,
  loadQuackExtension,
  validateQuackUri,
} from '@utils/quack';

jest.mock('@utils/duckdb/identifier', () => ({
  toDuckDBIdentifier: jest.fn((str: string) => {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)) return str;
    return `"${str.replace(/"/g, '""')}"`;
  }),
}));

describe('quack utils', () => {
  it('validates quack URIs', () => {
    expect(validateQuackUri('quack:localhost:9494')).toEqual({ isValid: true });
    expect(validateQuackUri('quack://localhost:9494')).toEqual({ isValid: true });
    expect(validateQuackUri('quack://')).toEqual({
      isValid: false,
      error: 'URI must start with quack: and include a host',
    });
    expect(validateQuackUri("quack:localhost:9494'; DROP TABLE x; --")).toEqual({
      isValid: false,
      error: 'URI contains unsupported characters',
    });
    expect(validateQuackUri('https://example.com')).toEqual({
      isValid: false,
      error: 'URI must start with quack: and include a host',
    });
  });

  it('builds a Quack ATTACH query with escaped alias, token, and SSL option', () => {
    expect(buildAttachQuackQuery('quack:localhost:9494', 'my-quack', true, "tok'en")).toBe(
      "ATTACH 'quack:localhost:9494' AS \"my-quack\" (TOKEN 'tok''en', DISABLE_SSL true)",
    );
  });

  it('omits the Quack ATTACH options clause when no options are provided', () => {
    expect(buildAttachQuackQuery('quack:localhost:9494', 'remote_quack')).toBe(
      "ATTACH 'quack:localhost:9494' AS remote_quack",
    );
  });

  it('builds a temporary Quack secret query and escapes token values', () => {
    expect(buildCreateQuackSecretQuery('quack:localhost', "tok'en", 'quack_secret')).toBe(
      "CREATE OR REPLACE TEMPORARY SECRET quack_secret (TYPE quack, TOKEN 'tok''en', SCOPE 'quack:localhost')",
    );
  });

  it('loads Quack from core nightly first', async () => {
    const query = jest.fn<() => Promise<unknown>>().mockResolvedValue({});

    await expect(loadQuackExtension({ query } as any)).resolves.toBeUndefined();
    expect(query).toHaveBeenNthCalledWith(1, 'FORCE INSTALL quack FROM core_nightly');
    expect(query).toHaveBeenLastCalledWith('LOAD quack');
  });

  it('tries community repositories when core nightly fails', async () => {
    const query = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('core nightly failed'))
      .mockRejectedValueOnce(new Error('core nightly failed'))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(loadQuackExtension({ query } as any)).resolves.toBeUndefined();
    expect(query).toHaveBeenNthCalledWith(3, 'FORCE INSTALL quack FROM community');
    expect(query).toHaveBeenLastCalledWith('LOAD quack');
  });

  it('falls back to pinned Quack WASM artifacts when repository loading fails', async () => {
    const query = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('core nightly failed'))
      .mockRejectedValueOnce(new Error('core nightly failed'))
      .mockRejectedValueOnce(new Error('community failed'))
      .mockRejectedValueOnce(new Error('community failed'))
      .mockRejectedValueOnce(new Error('explicit community failed'))
      .mockRejectedValueOnce(new Error('explicit community failed'))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(loadQuackExtension({ query } as any)).resolves.toBeUndefined();
    expect(query).toHaveBeenNthCalledWith(
      7,
      "LOAD 'https://extensions.duckdb.org/v1.5.2/wasm_eh/quack.duckdb_extension.wasm'",
    );
    expect(query).toHaveBeenLastCalledWith('LOAD quack');
  });

  it('honors a configured Quack WASM extension URL before pinned fallbacks', async () => {
    const {
      meta: { env },
    } = (globalThis as any).import;
    env.VITE_QUACK_WASM_EXTENSION_URL = '/duckdb-extensions/quack.duckdb_extension.wasm';
    try {
      const query = jest
        .fn<() => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('core nightly failed'))
        .mockRejectedValueOnce(new Error('core nightly failed'))
        .mockRejectedValueOnce(new Error('community failed'))
        .mockRejectedValueOnce(new Error('community failed'))
        .mockRejectedValueOnce(new Error('explicit community failed'))
        .mockRejectedValueOnce(new Error('explicit community failed'))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await expect(loadQuackExtension({ query } as any)).resolves.toBeUndefined();
      expect(query).toHaveBeenNthCalledWith(
        7,
        "LOAD '/duckdb-extensions/quack.duckdb_extension.wasm'",
      );
      expect(query).toHaveBeenLastCalledWith('LOAD quack');
    } finally {
      env.VITE_QUACK_WASM_EXTENSION_URL = undefined;
    }
  });

  it('retries with pinned Quack WASM artifacts when repository loading lacks ATTACH storage support', async () => {
    const pool = {
      query: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Binder Error: Unrecognized storage type "quack"'))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
    };

    await expect(
      attachQuackConnection({
        pool: pool as any,
        uri: 'quack:localhost:9494',
        dbName: 'remote_quack',
        token: 'token',
        disableSsl: true,
      }),
    ).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      "LOAD 'https://extensions.duckdb.org/v1.5.2/wasm_eh/quack.duckdb_extension.wasm'",
    );
  });

  it('reports DuckDB-WASM bundles that load Quack without ATTACH storage support', async () => {
    const pool = {
      query: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Binder Error: Unrecognized storage type "quack"'))
        .mockRejectedValueOnce(new Error('incompatible pinned artifact')),
    };

    await expect(
      attachQuackConnection({
        pool: pool as any,
        uri: 'quack:localhost:9494',
        dbName: 'remote_quack',
        token: 'token',
        disableSsl: true,
      }),
    ).rejects.toThrow('does not register Quack ATTACH support yet');
  });

  it('times out hanging Quack attach operations', async () => {
    jest.useFakeTimers();
    try {
      const pool = {
        query: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({})
          .mockImplementationOnce(() => new Promise(() => {})),
      };

      const promise = attachQuackConnection({
        pool: pool as any,
        uri: 'quack:localhost:9494',
        dbName: 'remote_quack',
        token: 'token',
        disableSsl: true,
      });
      const expectation = expect(promise).rejects.toThrow(
        'Attaching the Quack connection timed out',
      );

      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(20_000);

      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });

  it('loads Quack sidebar metadata through the attached query macro', async () => {
    const values: Record<string, unknown[]> = {
      is_table: [true, true],
      schema_name: ['main', 'main'],
      table_name: ['quack_items', 'quack_items'],
      column_name: ['id', 'name'],
      column_index: [1, 2],
      data_type: ['INTEGER', 'VARCHAR'],
      is_nullable: [true, false],
    };
    const pool = {
      query: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        numRows: 2,
        getChild: (name: string) => ({ get: (index: number) => values[name][index] }),
      }),
    };

    const metadata = await getQuackDatabaseModel(pool as any, 'quack_remote');

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('quack_remote.query'));
    expect(metadata.get('quack_remote')).toMatchObject({
      name: 'quack_remote',
      schemas: [
        {
          name: 'main',
          objects: [
            {
              name: 'quack_items',
              type: 'table',
              columns: [
                { name: 'id', databaseType: 'INTEGER', nullable: true },
                { name: 'name', databaseType: 'VARCHAR', nullable: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('reports unsupported DuckDB-WASM bundles when Quack cannot load', async () => {
    const pool = {
      query: jest
        .fn<() => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('incompatible extension'))
        .mockRejectedValueOnce(new Error('core nightly failed'))
        .mockRejectedValueOnce(new Error('core nightly failed'))
        .mockRejectedValueOnce(new Error('community failed'))
        .mockRejectedValueOnce(new Error('community failed'))
        .mockRejectedValueOnce(new Error('explicit community failed'))
        .mockRejectedValueOnce(new Error('explicit community failed')),
    };

    await expect(loadQuackExtension(pool as any)).rejects.toThrow(
      'current DuckDB-WASM bundle cannot load the Quack extension yet',
    );
  });
});
