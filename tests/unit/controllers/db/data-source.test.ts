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

  async query(sql: string) {
    this.calls.push(sql);
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

  it('does not unregister the file when dropping its view fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const dropQuery = buildDropViewQuery('people', true);
    connection.failQueries.add(dropQuery);

    await expect(dropViewAndUnregisterFile(pool, 'people', 'people.csv')).rejects.toThrow(
      'Failed to drop view "people"',
    );
    expect(bindings.dropFile).not.toHaveBeenCalled();
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

  it('does not unregister the database file when detach fails', async () => {
    const { bindings, connection, pool } = trackedPool();
    const detachQuery = buildDetachQuery('warehouse', true);
    connection.failQueries.add(detachQuery);

    await expect(
      detachAndUnregisterDatabase(pool, 'warehouse', 'warehouse.duckdb'),
    ).rejects.toThrow('Failed to detach database "warehouse"');
    expect(bindings.dropFile).not.toHaveBeenCalled();
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
});
