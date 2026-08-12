import { describe, expect, it, jest } from '@jest/globals';
import { PersistentDataSourceId, QuackRidgeConnection } from '@models/data-source';
import { TabId } from '@models/tab';
import { SecretId } from '@services/secret-store';
import { getFileDataAdapterQueries } from '@utils/data-adapter';

const connection: QuackRidgeConnection = {
  type: 'quackridge',
  id: 'ridge-id' as PersistentDataSourceId,
  endpoint: 'quack:127.0.0.1:9494',
  alias: 'ridge',
  productVersion: '0.1.0',
  protocolVersion: 1,
  capabilities: ['cancellation_noop', 'metadata_v1', 'pairing_v1', 'query_ids', 'sticky_sessions'],
  connectionState: 'connected',
  pairedAt: 1,
  attachedAt: 1,
  secretRef: 'secret' as SecretId,
};

describe('QuackRidge data adapter', () => {
  it('routes previews, sorting, counts, and aggregates as complete server queries', async () => {
    const send = jest.fn<(sql: string, stream?: boolean) => Promise<any>>().mockResolvedValue({});
    const query = jest.fn<(sql: string) => Promise<any>>().mockResolvedValue({
      getChildAt: () => ({ get: () => 42n }),
    });
    const { adapter, userErrors } = getFileDataAdapterQueries({
      pool: { send, query } as any,
      dataSource: connection,
      sourceFile: undefined,
      tab: {
        type: 'data-source',
        dataSourceType: 'db',
        id: 'tab' as TabId,
        dataSourceId: connection.id,
        databaseName: 'warehouse',
        schemaName: 'sales',
        objectName: 'orders',
        objectType: 'table',
      },
    });

    expect(userErrors).toEqual([]);
    expect(adapter?.sourceQuery).toContain("ridge.query('");
    expect(adapter?.sourceQuery).toContain('warehouse.sales.orders');

    await adapter?.getSortableReader?.(
      [{ column: 'created_at', order: 'desc' }],
      new AbortController().signal,
    );
    expect(send).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at desc'), true);

    await expect(adapter?.getRowCount?.(new AbortController().signal)).resolves.toEqual({
      value: 42,
      aborted: false,
    });
    await expect(
      adapter?.getColumnAggregate?.('amount', 'sum', new AbortController().signal),
    ).resolves.toEqual({ value: 42n, aborted: false });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT count(*) FROM warehouse.sales.orders'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT sum(amount) FROM warehouse.sales.orders'),
    );
  });

  it('reports disconnected bridges distinctly', () => {
    const result = getFileDataAdapterQueries({
      pool: {} as any,
      dataSource: { ...connection, connectionState: 'error' },
      sourceFile: undefined,
      tab: {
        type: 'data-source',
        dataSourceType: 'db',
        id: 'tab' as TabId,
        dataSourceId: connection.id,
        databaseName: 'warehouse',
        schemaName: 'sales',
        objectName: 'orders',
        objectType: 'table',
      },
    });
    expect(result.userErrors).toEqual(["QuackRidge 'ridge' is not connected"]);
  });
});
