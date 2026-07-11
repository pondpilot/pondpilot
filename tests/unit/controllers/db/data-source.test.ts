import {
  detachAndUnregisterDatabase,
  dropViewAndUnregisterFile,
  reAttachDatabase,
  reCreateView,
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/data-source';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { CSV_MAX_LINE_SIZE } from '@models/db';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { buildAttachQuery, buildDetachQuery, buildDropViewQuery } from '@utils/sql-builder';

class FakeConnection {
  public readonly calls: string[] = [];
  public readonly failQueries = new Set<string>();
  public readonly queryFailures = new Map<string, unknown>();

  async query(sql: string) {
    this.calls.push(sql);
    if (this.queryFailures.has(sql)) {
      throw this.queryFailures.get(sql);
    }
    if (this.failQueries.has(sql)) {
      throw new Error(`simulated query failure: ${sql}`);
    }
    return { toArray: () => [] };
  }

  async cancelSent() {
    return false;
  }

  async close() {
    return undefined;
  }

  async send() {
    return {
      async cancel() {
        return undefined;
      },
      async next() {
        return { done: true as const, value: null };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  async prepare() {
    return { close: async () => undefined };
  }

  async getTableNames() {
    return [];
  }
}

const makePool = () => {
  const connection = new FakeConnection();
  const bindings = {
    connect: jest.fn(async () => connection),
    dropFile: jest.fn(async (_fileName: string) => undefined),
    registerFileHandle: jest.fn(async () => undefined),
  };
  const pool = new AsyncDuckDBConnectionPool(bindings as any, 1, undefined, {
    checkpointOnClose: false,
    logCheckpoints: false,
  });

  return { bindings, connection, pool };
};

const makeHandle = (name: string): FileSystemFileHandle =>
  ({
    kind: 'file',
    name,
    getFile: jest.fn(async () => new File(['test'], name)),
  }) as unknown as FileSystemFileHandle;

const successfulViewCases: ['parquet' | 'zsav', string, string][] = [
  ['parquet', 'people.parquet', "CREATE OR REPLACE VIEW people AS SELECT * FROM 'people.parquet';"],
  [
    'zsav',
    'people.zsav',
    "CREATE OR REPLACE VIEW people AS SELECT * FROM read_stat('people.zsav', format='sav');",
  ],
];

describe('data-source DDL error handling', () => {
  const pools: AsyncDuckDBConnectionPool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.close()));
  });

  const trackedPool = () => {
    const result = makePool();
    pools.push(result.pool);
    return result;
  };

  it('unregisters a file and adds view context when view creation fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const createQuery = `CREATE OR REPLACE VIEW people AS SELECT * FROM read_csv('people.csv', strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`;
    connection.failQueries.add(createQuery);

    await expect(
      registerFileSourceAndCreateView(
        pool,
        makeHandle('people.csv'),
        'csv',
        'people.csv',
        'people',
      ),
    ).rejects.toThrow('Failed to create view "people" for file "people.csv"');

    expect(bindings.registerFileHandle).toHaveBeenCalledTimes(1);
    expect(bindings.dropFile).toHaveBeenCalledTimes(2);
  });

  it('reports both a non-Error view failure and a failed unregister rollback', async () => {
    const { bindings, connection, pool } = trackedPool();
    const createQuery = `CREATE OR REPLACE VIEW people AS SELECT * FROM read_csv('people.csv', strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`;
    connection.queryFailures.set(createQuery, 'invalid csv');
    bindings.dropFile
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('file still in use');
      });

    await expect(
      registerFileSourceAndCreateView(
        pool,
        makeHandle('people.csv'),
        'csv',
        'people.csv',
        'people',
      ),
    ).rejects.toThrow(
      'Failed to create view "people" for file "people.csv": invalid csv. Rollback also failed: file still in use',
    );
  });

  it('tolerates a missing pre-registration file and adds context when registration fails', async () => {
    const firstRegistration = trackedPool();
    firstRegistration.bindings.dropFile.mockImplementationOnce(async () => {
      throw new Error('file not found');
    });

    await registerFileSourceAndCreateView(
      firstRegistration.pool,
      makeHandle('people.csv'),
      'csv',
      'people.csv',
      'people',
    );

    expect(firstRegistration.bindings.registerFileHandle).toHaveBeenCalledTimes(1);

    const registering = trackedPool();
    registering.bindings.registerFileHandle.mockImplementationOnce(async () => {
      throw new Error('register failed');
    });

    await expect(
      registerFileSourceAndCreateView(
        registering.pool,
        makeHandle('people.csv'),
        'csv',
        'people.csv',
        'people',
      ),
    ).rejects.toThrow('Failed to register file "people.csv": register failed');
  });

  it.each(successfulViewCases)(
    'creates a %s view successfully',
    async (fileExt, fileName, expectedQuery) => {
      const { connection, pool } = trackedPool();

      await registerFileSourceAndCreateView(
        pool,
        makeHandle(fileName),
        fileExt,
        fileName,
        'people',
      );

      expect(connection.calls).toContain(expectedQuery);
    },
  );

  it('does not unregister the file when dropping its view fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const dropQuery = buildDropViewQuery('people', true);
    connection.failQueries.add(dropQuery);

    await expect(dropViewAndUnregisterFile(pool, 'people', 'people.csv')).rejects.toThrow(
      'Failed to drop view "people"',
    );
    expect(bindings.dropFile).not.toHaveBeenCalled();
  });

  it('supports dropping a view without a registered file', async () => {
    const { bindings, connection, pool } = trackedPool();

    await dropViewAndUnregisterFile(pool, 'temporary_view', undefined);

    expect(connection.calls).toContain(buildDropViewQuery('temporary_view', true));
    expect(bindings.dropFile).not.toHaveBeenCalled();
  });

  it('adds context when unregistering a dropped view file fails', async () => {
    const { bindings, pool } = trackedPool();
    bindings.dropFile.mockImplementationOnce(async () => {
      throw new Error('file still in use');
    });

    await expect(dropViewAndUnregisterFile(pool, 'people', 'people.csv')).rejects.toThrow(
      'Failed to unregister file "people.csv": file still in use',
    );
  });

  it('keeps the old view when creating its replacement fails', async () => {
    const { connection, pool } = trackedPool();
    const createQuery = "CREATE OR REPLACE VIEW customers AS SELECT * FROM 'people.parquet';";
    connection.failQueries.add(createQuery);

    await expect(
      reCreateView(pool, 'parquet', 'people.parquet', 'people', 'customers'),
    ).rejects.toThrow('Failed to create replacement view "customers"');
    expect(connection.calls).not.toContain(buildDropViewQuery('people', true));
  });

  it('reports when dropping both the old and rollback views fails', async () => {
    const { connection, pool } = trackedPool();
    const dropOldQuery = buildDropViewQuery('people', true);
    const dropNewQuery = buildDropViewQuery('customers', true);
    connection.failQueries.add(dropOldQuery);
    connection.failQueries.add(dropNewQuery);

    await expect(
      reCreateView(pool, 'parquet', 'people.parquet', 'people', 'customers'),
    ).rejects.toThrow(
      `Failed to replace view "people" with "customers": simulated query failure: ${dropOldQuery}. Rollback also failed: simulated query failure: ${dropNewQuery}`,
    );
  });

  it('removes the replacement view when dropping the old view fails', async () => {
    const { connection, pool } = trackedPool();
    const dropOldQuery = buildDropViewQuery('people', true);
    const dropNewQuery = buildDropViewQuery('customers', true);
    connection.failQueries.add(dropOldQuery);

    await expect(reCreateView(pool, 'csv', 'people.csv', 'people', 'customers')).rejects.toThrow(
      'Failed to replace view "people" with "customers"',
    );
    expect(connection.calls).toContain(dropNewQuery);
  });

  it('recreates a statistical view successfully', async () => {
    const { connection, pool } = trackedPool();

    await reCreateView(pool, 'sav', 'people.sav', 'people', 'customers');

    expect(connection.calls).toContain(
      "CREATE OR REPLACE VIEW customers AS SELECT * FROM read_stat('people.sav', format='sav');",
    );
    expect(connection.calls).toContain(buildDropViewQuery('people', true));
  });

  it('does not drop a view when recreating it with the same name', async () => {
    const { connection, pool } = trackedPool();

    await reCreateView(pool, 'parquet', 'people.parquet', 'people', 'people');

    expect(connection.calls).toEqual([
      "CREATE OR REPLACE VIEW people AS SELECT * FROM 'people.parquet';",
    ]);
  });

  it('unregisters a database file and adds attach context when attachment fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const attachQuery = buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true });
    connection.failQueries.add(attachQuery);

    await expect(
      registerAndAttachDatabase(
        pool,
        makeHandle('warehouse.duckdb'),
        'warehouse.duckdb',
        'warehouse',
      ),
    ).rejects.toThrow('Failed to attach database "warehouse" from file "warehouse.duckdb"');

    expect(bindings.registerFileHandle).toHaveBeenCalledTimes(1);
    expect(bindings.dropFile).toHaveBeenCalledTimes(2);
  });

  it('reports when database attachment and unregister rollback both fail', async () => {
    const { bindings, connection, pool } = trackedPool();
    const attachQuery = buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true });
    connection.failQueries.add(attachQuery);
    bindings.dropFile
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('file still in use');
      });

    await expect(
      registerAndAttachDatabase(
        pool,
        makeHandle('warehouse.duckdb'),
        'warehouse.duckdb',
        'warehouse',
      ),
    ).rejects.toThrow(
      'Failed to attach database "warehouse" from file "warehouse.duckdb"' +
        `: simulated query failure: ${attachQuery}. Rollback also failed: file still in use`,
    );
  });

  it('reports when database preparation and unregister rollback both fail', async () => {
    const { bindings, connection, pool } = trackedPool();
    const detachQuery = buildDetachQuery('warehouse', true);
    connection.failQueries.add(detachQuery);
    bindings.dropFile
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('file still in use');
      });

    await expect(
      registerAndAttachDatabase(
        pool,
        makeHandle('warehouse.duckdb'),
        'warehouse.duckdb',
        'warehouse',
      ),
    ).rejects.toThrow(
      'Failed to prepare database "warehouse" for attachment' +
        `: simulated query failure: ${detachQuery}. Rollback also failed: file still in use`,
    );
  });

  it('unregisters a database file when preparation fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const detachQuery = buildDetachQuery('warehouse', true);
    connection.failQueries.add(detachQuery);

    await expect(
      registerAndAttachDatabase(
        pool,
        makeHandle('warehouse.duckdb'),
        'warehouse.duckdb',
        'warehouse',
      ),
    ).rejects.toThrow('Failed to prepare database "warehouse" for attachment');
    expect(bindings.dropFile).toHaveBeenCalledTimes(2);
  });

  it('registers and attaches a database successfully', async () => {
    const { bindings, connection, pool } = trackedPool();

    const file = await registerAndAttachDatabase(
      pool,
      makeHandle('warehouse.duckdb'),
      'warehouse.duckdb',
      'warehouse',
    );

    expect(file.name).toBe('warehouse.duckdb');
    expect(bindings.registerFileHandle).toHaveBeenCalledTimes(1);
    expect(connection.calls).toContain(
      buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true }),
    );
  });

  it('tolerates a missing pre-registration database file and adds context when registration fails', async () => {
    const firstRegistration = trackedPool();
    firstRegistration.bindings.dropFile.mockImplementationOnce(async () => {
      throw new Error('file not found');
    });

    await registerAndAttachDatabase(
      firstRegistration.pool,
      makeHandle('warehouse.duckdb'),
      'warehouse.duckdb',
      'warehouse',
    );

    expect(firstRegistration.bindings.registerFileHandle).toHaveBeenCalledTimes(1);

    const registering = trackedPool();
    registering.bindings.registerFileHandle.mockImplementationOnce(async () => {
      throw new Error('register failed');
    });

    await expect(
      registerAndAttachDatabase(
        registering.pool,
        makeHandle('warehouse.duckdb'),
        'warehouse.duckdb',
        'warehouse',
      ),
    ).rejects.toThrow('Failed to register database file "warehouse.duckdb": register failed');
  });

  it('does not unregister the database file when detach fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const detachQuery = buildDetachQuery('warehouse', true);
    connection.failQueries.add(detachQuery);

    await expect(
      detachAndUnregisterDatabase(pool, 'warehouse', 'warehouse.duckdb'),
    ).rejects.toThrow('Failed to detach database "warehouse"');
    expect(bindings.dropFile).not.toHaveBeenCalled();
  });

  it('supports detaching a database without a registered file', async () => {
    const { bindings, connection, pool } = trackedPool();

    await detachAndUnregisterDatabase(pool, 'warehouse', undefined);

    expect(connection.calls).toContain(buildDetachQuery('warehouse', true));
    expect(bindings.dropFile).not.toHaveBeenCalled();
  });

  it('adds context when unregistering a detached database file fails', async () => {
    const { bindings, pool } = trackedPool();
    bindings.dropFile.mockImplementationOnce(async () => {
      throw new Error('file still in use');
    });

    await expect(
      detachAndUnregisterDatabase(pool, 'warehouse', 'warehouse.duckdb'),
    ).rejects.toThrow('Failed to unregister database file "warehouse.duckdb": file still in use');
  });

  it('reattaches the old database alias when attaching the new alias fails', async () => {
    const { connection, pool } = trackedPool();
    const attachNewQuery = buildAttachQuery('warehouse.duckdb', 'analytics', { readOnly: true });
    const attachOldQuery = buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true });
    connection.failQueries.add(attachNewQuery);

    await expect(
      reAttachDatabase(pool, 'warehouse.duckdb', 'warehouse', 'analytics'),
    ).rejects.toThrow('Failed to rename database "warehouse" to "analytics"');
    expect(connection.calls).toContain(attachOldQuery);
  });

  it('reports when the new attachment and old-alias rollback both fail', async () => {
    const { connection, pool } = trackedPool();
    const attachNewQuery = buildAttachQuery('warehouse.duckdb', 'analytics', { readOnly: true });
    const attachOldQuery = buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true });
    connection.failQueries.add(attachNewQuery);
    connection.failQueries.add(attachOldQuery);

    await expect(
      reAttachDatabase(pool, 'warehouse.duckdb', 'warehouse', 'analytics'),
    ).rejects.toThrow(
      `Failed to rename database "warehouse" to "analytics": simulated query failure: ${attachNewQuery}. Rollback also failed: simulated query failure: ${attachOldQuery}`,
    );
  });

  it('adds context when the old database cannot be detached for rename', async () => {
    const { connection, pool } = trackedPool();
    const detachQuery = buildDetachQuery('warehouse', true);
    connection.failQueries.add(detachQuery);

    await expect(
      reAttachDatabase(pool, 'warehouse.duckdb', 'warehouse', 'analytics'),
    ).rejects.toThrow('Failed to detach database "warehouse" for rename');
  });

  it('reattaches the same database alias without a redundant detach', async () => {
    const { connection, pool } = trackedPool();

    await reAttachDatabase(pool, 'warehouse.duckdb', 'warehouse', 'warehouse');

    expect(connection.calls).toEqual([
      buildDetachQuery('warehouse', true),
      buildAttachQuery('warehouse.duckdb', 'warehouse', { readOnly: true }),
    ]);
  });
});
