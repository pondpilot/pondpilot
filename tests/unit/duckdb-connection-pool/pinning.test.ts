import {
  AsyncDuckDBConnectionPool,
  DuckDBConnectionPoolOptions,
} from '@features/duckdb-context/duckdb-connection-pool';
import { describe, expect, it, jest } from '@jest/globals';
import { TabId } from '@models/tab';

class FakeConnection {
  public readonly calls: string[] = [];
  public closed = false;

  constructor(public readonly id: number) {}

  async query(sql: string) {
    this.calls.push(sql);
    return { toArray: () => [] };
  }

  async cancelSent() {
    this.calls.push('cancelSent');
    return false;
  }

  async close() {
    this.closed = true;
  }

  async send() {
    return [];
  }

  async prepare() {
    return { close: async () => undefined };
  }

  async getTableNames() {
    return [];
  }
}

const makePool = (
  maxSize = 4,
  backgroundReservation = 1,
  options?: Omit<DuckDBConnectionPoolOptions, 'backgroundReservation'>,
) => {
  const connections: FakeConnection[] = [];
  const bindings = {
    connect: jest.fn(async () => {
      const conn = new FakeConnection(connections.length);
      connections.push(conn);
      return conn;
    }),
  };

  const pool = new AsyncDuckDBConnectionPool(
    bindings as any,
    maxSize,
    undefined,
    undefined,
    undefined,
    { backgroundReservation, ...options },
  );

  return { pool, connections };
};

const tabId = (value: string) => value as TabId;

describe('AsyncDuckDBConnectionPool pinned tab sessions', () => {
  it('pins and unpins tab connections with reset ordering', async () => {
    const { pool, connections } = makePool();

    const conn = await pool.pinForTab(tabId('tab-a'));
    await conn.close();

    expect(Array.from((pool as any)._pinnedTabs.values())).toEqual([1]);

    await pool.unpinTab(tabId('tab-a'));

    expect((pool as any)._pinnedTabs.size).toBe(0);
    expect(connections[1].calls).toEqual([
      'cancelSent',
      'cancelSent',
      'USE memory;',
      'SET search_path TO main;',
      'ROLLBACK;',
    ]);
  });

  it('touches LRU order when an existing tab pin is reused', async () => {
    const { pool } = makePool(5, 1);

    const first = await pool.pinForTab(tabId('tab-a'));
    await first.close();
    const second = await pool.pinForTab(tabId('tab-b'));
    await second.close();
    const reused = await pool.pinForTab(tabId('tab-a'));
    await reused.close();

    expect((pool as any)._pinnedLruOrder).toEqual([tabId('tab-b'), tabId('tab-a')]);
  });

  it('keeps background connections isolated from pinned indexes', async () => {
    const { pool } = makePool(4, 1);

    const a = await pool.pinForTab(tabId('tab-a'));
    await a.close();
    const b = await pool.pinForTab(tabId('tab-b'));
    await b.close();

    const background = await pool.getBackgroundConnection();
    const inUse = Array.from((pool as any)._inUse.values());
    await background.close();

    expect(inUse).toEqual([0]);
    expect(Array.from((pool as any)._pinnedTabs.values()).every((index) => index !== 0)).toBe(true);
  });

  it('soft-evicts the least recently used pin and fires the callback', async () => {
    const evicted: TabId[] = [];
    const { pool } = makePool(3, 1, { onTabEvicted: (id) => evicted.push(id) });

    const a = await pool.pinForTab(tabId('tab-a'));
    await a.close();
    const b = await pool.pinForTab(tabId('tab-b'));
    await b.close();
    const c = await pool.pinForTab(tabId('tab-c'));
    await c.close();

    expect(evicted).toEqual([tabId('tab-a')]);
    expect(Array.from((pool as any)._pinnedTabs.keys())).toEqual([tabId('tab-b'), tabId('tab-c')]);
  });

  it('coalesces concurrent first pins for the same tab', async () => {
    const { pool, connections } = makePool(4, 1);

    const firstPromise = pool.pinForTab(tabId('tab-a'));
    const secondPromise = pool.pinForTab(tabId('tab-a'));

    const first = await firstPromise;
    expect((pool as any)._pinnedTabs.size).toBe(1);
    await first.close();

    const second = await secondPromise;
    await second.close();

    expect((pool as any)._pinnedTabs.size).toBe(1);
    expect(Array.from((pool as any)._pinnedTabs.values())).toEqual([1]);
    expect(connections).toHaveLength(2);
  });

  it('runs the tab hydration callback before pinned tab queries', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    const pin = await pool.pinForTab(tabId('tab-a'));
    await pin.close();
    hydrated.length = 0;

    const result = await pool.queryAbortableForTab(tabId('tab-a'), 'SELECT 1', new AbortController().signal);

    expect(result.aborted).toBe(false);
    expect(hydrated).toEqual([tabId('tab-a')]);
  });
});
