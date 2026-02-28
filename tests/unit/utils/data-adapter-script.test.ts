import { describe, it, expect, jest } from '@jest/globals';
import { TabId } from '@models/tab';
import { getScriptAdapterQueries } from '@utils/data-adapter';

describe('getScriptAdapterQueries', () => {
  const tab = {
    type: 'script' as const,
    id: 'script-tab-1' as TabId,
    sqlScriptId: 'script-1' as any,
    dataViewPaneHeight: 300,
    editorPaneHeight: 200,
    lastExecutedQuery: 'SELECT 1',
  };

  it('uses shared connection query for notebook readers and avoids shared send()', async () => {
    const batch1 = { id: 'batch-1' } as any;
    const batch2 = { id: 'batch-2' } as any;

    const sharedConnection = {
      query: jest.fn(async () => ({ batches: [batch1, batch2] })),
      send: jest.fn(),
    } as any;

    const getSharedConnection = jest.fn(async () => sharedConnection);

    const pool = {
      sendAbortable: jest.fn(),
      queryAbortable: jest.fn(),
    } as any;

    const { adapter } = getScriptAdapterQueries({
      pool,
      tab,
      getSharedConnection,
    });

    const reader = await adapter!.getSortableReader!([], new AbortController().signal);

    expect(reader).not.toBeNull();
    expect(getSharedConnection).toHaveBeenCalledTimes(1);
    expect(sharedConnection.query).toHaveBeenCalledWith('SELECT 1');
    expect(sharedConnection.send).not.toHaveBeenCalled();
    expect(pool.sendAbortable).not.toHaveBeenCalled();

    const first = await reader!.next();
    expect(first).toEqual({ done: false, value: batch1 });

    const second = await reader!.next();
    expect(second).toEqual({ done: false, value: batch2 });

    const done = await reader!.next();
    expect(done).toEqual({ done: true, value: null });
  });

  it('returns null immediately when aborted before creating a shared reader', async () => {
    const sharedConnection = {
      query: jest.fn(),
    } as any;

    const pool = {
      sendAbortable: jest.fn(),
      queryAbortable: jest.fn(),
    } as any;

    const { adapter } = getScriptAdapterQueries({
      pool,
      tab,
      getSharedConnection: async () => sharedConnection,
    });

    const abortController = new AbortController();
    abortController.abort();

    const reader = await adapter!.getSortableReader!([], abortController.signal);

    expect(reader).toBeNull();
    expect(sharedConnection.query).not.toHaveBeenCalled();
    expect(pool.sendAbortable).not.toHaveBeenCalled();
  });
});
