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
  it('uses an ordinary catalog scan so browser DuckDB remains the coordinator', async () => {
    const sendAbortable = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({});
    const queryAbortable = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      value: { getChildAt: () => ({ get: () => 42n }) },
      aborted: false,
    });
    const { adapter, userErrors } = getFileDataAdapterQueries({
      pool: { sendAbortable, queryAbortable } as any,
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
    expect(adapter?.sourceQuery).toBe('SELECT * FROM warehouse.sales.orders');
    expect(adapter?.sourceQuery).not.toContain('.query(');

    await adapter?.getSortableReader?.(
      [{ column: 'created_at', order: 'desc' }],
      new AbortController().signal,
    );
    expect(sendAbortable).toHaveBeenCalledWith(
      'SELECT * FROM warehouse.sales.orders ORDER BY created_at desc',
      expect.any(AbortSignal),
      true,
    );

    await expect(
      adapter?.getColumnAggregate?.('amount', 'sum', new AbortController().signal),
    ).resolves.toEqual({ value: 42n, aborted: false });
    expect(queryAbortable).toHaveBeenCalledWith(
      'SELECT sum(amount) FROM warehouse.sales.orders',
      expect.any(AbortSignal),
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
