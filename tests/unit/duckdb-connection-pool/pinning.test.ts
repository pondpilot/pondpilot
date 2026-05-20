import {
  AsyncDuckDBConnectionPool,
  DuckDBConnectionPoolOptions,
} from '@features/duckdb-context/duckdb-connection-pool';
import { describe, expect, it, jest } from '@jest/globals';
import { TabId } from '@models/tab';

class FakeConnection {
  public readonly calls: string[] = [];
  public closed = false;
  /** Optional hook fired when cancelSent runs — used to simulate query termination releasing the slot. */
  public onCancel?: () => void;

  constructor(public readonly id: number) {}

  async query(sql: string) {
    this.calls.push(sql);
    return { toArray: () => [] };
  }

  async cancelSent() {
    this.calls.push('cancelSent');
    this.onCancel?.();
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
      'ROLLBACK;',
      'USE memory;',
      'SET search_path TO main;',
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

  it('does not leak a pinned slot when a tab is closed while pin is in flight', async () => {
    const connections: FakeConnection[] = [];
    let releaseFirstConnect: (() => void) | undefined;
    let connectCallCount = 0;

    const bindings = {
      connect: jest.fn(async () => {
        connectCallCount += 1;
        // Stall the first connect() so we can call unpinTab while the pin is in flight.
        if (connectCallCount === 2) {
          await new Promise<void>((resolve) => {
            releaseFirstConnect = resolve;
          });
        }
        const conn = new FakeConnection(connections.length);
        connections.push(conn);
        return conn;
      }),
    };

    const pool = new AsyncDuckDBConnectionPool(
      bindings as any,
      4,
      undefined,
      undefined,
      undefined,
      { backgroundReservation: 1 },
    );

    const pinPromise = pool.pinForTab(tabId('tab-a'));
    // Give the pinForTab async chain a tick to enter the in-flight state.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((pool as any)._pinPromises.has(tabId('tab-a'))).toBe(true);

    const unpinPromise = pool.unpinTab(tabId('tab-a'));
    // Release the stalled connect so the pin completes.
    releaseFirstConnect?.();

    const pinned = await pinPromise;
    await pinned.close();
    await unpinPromise;

    expect((pool as any)._pinnedTabs.size).toBe(0);
    expect((pool as any)._pinPromises.size).toBe(0);
  });

  it('cancels an in-flight query when the LRU pinned slot is evicted', async () => {
    const evicted: TabId[] = [];
    const { pool, connections } = makePool(3, 1, { onTabEvicted: (id) => evicted.push(id) });

    const a = await pool.pinForTab(tabId('tab-a'));
    await a.close();
    const b = await pool.pinForTab(tabId('tab-b'));
    await b.close();

    // Simulate tab-a's connection still in-flight: mark as in-use and wire up
    // cancelSent to release the slot, mirroring what a real query's
    // onFinalize would do once it sees the cancel propagate through.
    const indexA = (pool as any)._pinnedTabs.get(tabId('tab-a'));
    (pool as any)._inUse.add(indexA);
    connections[indexA].onCancel = () => {
      (pool as any)._inUse.delete(indexA);
    };

    // Eviction would previously wait for GET_CONNECTION_TIMEOUT; with the fix
    // it cancels the busy connection and reclaims the slot immediately.
    const c = await pool.pinForTab(tabId('tab-c'));
    await c.close();

    expect(evicted).toEqual([tabId('tab-a')]);
    expect(connections[indexA].calls).toContain('cancelSent');
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

    const result = await pool.queryAbortableForTab(
      tabId('tab-a'),
      'SELECT 1',
      new AbortController().signal,
    );

    expect(result.aborted).toBe(false);
    expect(hydrated).toEqual([tabId('tab-a')]);
  });
});
