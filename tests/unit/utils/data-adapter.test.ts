import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { describe, expect, it, jest } from '@jest/globals';
import { DataAdapterStreamReader } from '@models/data-adapter';
import { DuckLakeCatalog, PersistentDataSourceId } from '@models/data-source';
import { LocalDBDataTab, TabReactiveState } from '@models/tab';
import { getFileDataAdapterQueries } from '@utils/data-adapter';

function makeStreamReader(batchRowCounts: number[]): DataAdapterStreamReader<any> {
  let index = 0;
  let isClosed = false;

  return {
    get closed() {
      return isClosed;
    },
    async cancel() {
      isClosed = true;
    },
    async next() {
      if (isClosed || index >= batchRowCounts.length) {
        isClosed = true;
        return { done: true, value: null } as const;
      }

      const numRows = batchRowCounts[index];
      index += 1;

      return {
        done: false,
        value: { numRows } as any,
      } as const;
    },
  };
}

function makeDuckLakeCatalog(): DuckLakeCatalog {
  return {
    type: 'ducklake-catalog',
    id: 'ducklake-id' as PersistentDataSourceId,
    url: 'https://example.com/catalog.ducklake',
    catalogAlias: 'ducklake_demo',
    connectionState: 'connected',
    attachedAt: Date.now(),
    readOnly: true,
  };
}

function makeTab(): TabReactiveState<LocalDBDataTab> {
  return {
    type: 'data-source',
    dataSourceType: 'db',
    id: 'tab-id' as LocalDBDataTab['id'],
    dataSourceId: 'ducklake-id' as PersistentDataSourceId,
    schemaName: 'main',
    objectName: 'orders',
    objectType: 'table',
  };
}

describe('getFileDataAdapterQueries DuckLake reader', () => {
  it('pages DuckLake reads with LIMIT/OFFSET instead of one unbounded stream', async () => {
    const sendAbortable = jest
      .fn<AsyncDuckDBConnectionPool['sendAbortable']>()
      .mockResolvedValueOnce(makeStreamReader([2048]) as any)
      .mockResolvedValueOnce(makeStreamReader([10]) as any);

    const pool = {
      sendAbortable,
    } as unknown as AsyncDuckDBConnectionPool;

    const { adapter } = getFileDataAdapterQueries({
      pool,
      dataSource: makeDuckLakeCatalog(),
      tab: makeTab(),
      sourceFile: undefined,
    });

    expect(adapter?.getSortableReader).toBeDefined();

    const reader = await adapter!.getSortableReader!([], new AbortController().signal);
    expect(reader).not.toBeNull();
    expect(sendAbortable).not.toHaveBeenCalled();

    const firstBatch = await reader!.next();
    expect(firstBatch.done).toBe(false);
    expect(firstBatch.done ? null : firstBatch.value.numRows).toBe(2048);
    expect(sendAbortable).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM ducklake_demo.main.orders LIMIT 2048 OFFSET 0',
      expect.any(AbortSignal),
      true,
    );

    const secondBatch = await reader!.next();
    expect(secondBatch.done).toBe(false);
    expect(secondBatch.done ? null : secondBatch.value.numRows).toBe(10);
    expect(sendAbortable).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM ducklake_demo.main.orders LIMIT 2048 OFFSET 2048',
      expect.any(AbortSignal),
      true,
    );

    const end = await reader!.next();
    expect(end).toEqual({ done: true, value: null });
  });

  it('keeps ORDER BY clauses when paging DuckLake reads', async () => {
    const sendAbortable = jest
      .fn<AsyncDuckDBConnectionPool['sendAbortable']>()
      .mockResolvedValueOnce(makeStreamReader([1]) as any);

    const pool = {
      sendAbortable,
    } as unknown as AsyncDuckDBConnectionPool;

    const { adapter } = getFileDataAdapterQueries({
      pool,
      dataSource: makeDuckLakeCatalog(),
      tab: makeTab(),
      sourceFile: undefined,
    });

    const reader = await adapter!.getSortableReader!(
      [{ column: 'order total', order: 'desc' }],
      new AbortController().signal,
    );

    await reader!.next();

    expect(sendAbortable).toHaveBeenCalledWith(
      'SELECT * FROM ducklake_demo.main.orders ORDER BY "order total" desc LIMIT 2048 OFFSET 0',
      expect.any(AbortSignal),
      true,
    );
  });
});
