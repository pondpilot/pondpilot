import { describe, expect, it, jest } from '@jest/globals';
import { TabId } from '@models/tab';
import {
  AsyncDuckDBConnectionPool,
  DuckDBConnectionPoolOptions,
} from '@services/duckdb-pool/duckdb-connection-pool';

class FakeConnection {
  public readonly calls: string[] = [];
  public readonly databases = new Set<string>();
  public currentDatabase: string | null = 'memory';
  public closed = false;
  /** Optional hook fired when cancelSent runs — used to simulate query termination releasing the slot. */
  public onCancel?: () => void;
  /** Optional hook fired when query runs — used to simulate concurrent catalog mutations. */
  public onQuery?: (sql: string) => void;
  /** Exact query strings that should throw — used to exercise best-effort reset paths. */
  public failQueries?: Set<string>;
  public failCancel = false;

  constructor(public readonly id: number) {}

  async query(sql: string) {
    this.calls.push(sql);
    this.onQuery?.(sql);
    if (this.failQueries?.has(sql)) {
      throw new Error(`simulated query failure: ${sql}`);
    }
    const databaseFilter = /database_name\s*=\s*'([^']+)'/i.exec(sql)?.[1];
    if (databaseFilter) {
      return {
        toArray: () =>
          this.databases.has(databaseFilter) ? [{ database_name: databaseFilter }] : [],
      };
    }
    if (/SELECT\s+current_database\(\)\s+AS\s+db/i.test(sql)) {
      return { toArray: () => [{ db: this.currentDatabase }] };
    }
    const useDb = /^\s*USE\s+(?:"([^"]+)"|(\w+))/i.exec(sql);
    if (useDb) {
      this.currentDatabase = useDb[1] ?? useDb[2];
    }
    const attachAlias = /\bATTACH\b[\s\S]*\bAS\s+(?:"([^"]+)"|(\w+))/i.exec(sql);
    if (attachAlias) {
      this.databases.add(attachAlias[1] ?? attachAlias[2]);
    }
    const detachAlias = /\bDETACH\s+(?:DATABASE\s+)?(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))/i.exec(
      sql,
    );
    if (detachAlias) {
      const alias = detachAlias[1] ?? detachAlias[2];
      if (this.currentDatabase === alias) {
        throw new Error(`Cannot detach database "${alias}" because it is the default database`);
      }
      this.databases.delete(alias);
    }
    return { toArray: () => [] };
  }

  async cancelSent() {
    this.calls.push('cancelSent');
    if (this.failCancel) {
      throw new Error('simulated cancel failure');
    }
    this.onCancel?.();
    return false;
  }

  async close() {
    this.closed = true;
  }

  async send(sql?: string) {
    if (sql) this.calls.push(sql);
    return createFakeStreamReader();
  }

  async prepare() {
    return { close: async () => undefined };
  }

  async getTableNames() {
    return [];
  }
}

// Minimal empty async-batch reader test double. A factory (not a class) so the
// file keeps a single class and the iterator stays a plain method rather than a
// yield-less generator. The pooled wrapper consumes it via cancel()/next(),
// while queryAbortableForTab iterates the raw reader via `for await`.
const createFakeStreamReader = () => {
  const reader = {
    cancelled: false,
    async cancel() {
      reader.cancelled = true;
    },
    async next() {
      return { done: true as const, value: null };
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };
  return reader;
};

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

  it('records post-run session state against the pinned connection', async () => {
    const recorded: Array<{
      tabId: TabId;
      connId: number;
      catalog: string | null;
      schema: string | null;
    }> = [];
    const { pool, connections } = makePool(4, 1, {
      onTabConnectionSessionRecorded: (id, conn, session) => {
        recorded.push({
          tabId: id,
          connId: (conn as unknown as FakeConnection).id,
          catalog: session.catalog,
          schema: session.schema,
        });
      },
    });

    const conn = await pool.pinForTab(tabId('tab-a'));
    pool.recordPinnedTabConnectionSession(tabId('tab-a'), {
      catalog: 'memory',
      schema: 's1',
    });
    await conn.close();

    expect(recorded).toEqual([
      {
        tabId: tabId('tab-a'),
        connId: connections[1].id,
        catalog: 'memory',
        schema: 's1',
      },
    ]);
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

  it('lets background work use idle unpinned capacity beyond the reserved minimum', async () => {
    // maxSize 10, bgRes 3 → pinnableLimit 7, pin-reserved band = top 3 slots
    // [7,10). Background may use the reserved floor [0,3) plus the shared middle
    // [3,7), so opening 5 connections spills two slots past the reserved 3.
    const { pool } = makePool(10, 3);

    const conns = await Promise.all(
      Array.from({ length: 5 }, () => pool.getBackgroundConnection()),
    );
    const inUse = Array.from((pool as any)._inUse.values());

    await Promise.all(conns.map((conn) => conn.close()));

    expect(inUse).toEqual([0, 1, 2, 3, 4]);
  });

  it('reserves the top of the pinnable region for pins even under background load', async () => {
    // maxSize 6, bgRes 2 → pinnableLimit 4, pin-reserved band = top 2 slots
    // [4,6). Background may only use [0,4): its floor [0,2) plus the shared
    // middle [2,4).
    const { pool } = makePool(6, 2);

    // Saturate every slot background is allowed to use.
    const background = await Promise.all(
      Array.from({ length: 4 }, () => pool.getBackgroundConnection()),
    );
    expect(Array.from((pool as any)._inUse.values())).toEqual([0, 1, 2, 3]);

    // Background cannot spill into the pin-reserved band — a further claim finds
    // no eligible slot rather than taking [4,6).
    expect((pool as any)._claimConnection('background')).toBeNull();

    // A pin is still creatable in the reserved band despite the background load.
    const pinned = await pool.pinForTab(tabId('tab-a'));
    expect((pool as any)._pinnedTabs.get(tabId('tab-a'))).toBeGreaterThanOrEqual(4);

    await pinned.close();
    await Promise.all(background.map((conn) => conn.close()));
  });

  it('replays registered ATTACH statements onto background connections before queries', async () => {
    const { pool, connections } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query("ATTACH '/tmp/remote.duckdb' AS remote_db");
    await pinned.close();

    pool.registerGlobalAttach('remote_db', "ATTACH '/tmp/remote.duckdb' AS remote_db");
    await pool.query('SELECT * FROM remote_db.main.t');

    expect(connections[0].calls).toContain("ATTACH '/tmp/remote.duckdb' AS remote_db");
    expect(connections[0].calls).toContain('SELECT * FROM remote_db.main.t');
  });

  it('replays registered ATTACH setup statements before the ATTACH', async () => {
    const { pool, connections } = makePool(4, 1);

    pool.registerGlobalAttach(
      'iceberg_db',
      "ATTACH 'warehouse' AS iceberg_db (TYPE ICEBERG, SECRET s)",
      ["CREATE SECRET s (TYPE ICEBERG, TOKEN 'token')"],
    );
    await pool.query('SELECT * FROM iceberg_db.main.t');

    const setupIndex = connections[0].calls.indexOf(
      "CREATE SECRET s (TYPE ICEBERG, TOKEN 'token')",
    );
    const attachIndex = connections[0].calls.indexOf(
      "ATTACH 'warehouse' AS iceberg_db (TYPE ICEBERG, SECRET s)",
    );
    const queryIndex = connections[0].calls.indexOf('SELECT * FROM iceberg_db.main.t');
    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeGreaterThan(setupIndex);
    expect(queryIndex).toBeGreaterThan(attachIndex);
  });

  it('updates registered ATTACH setup without replaying on the already-applied connection', async () => {
    const { pool, connections } = makePool(4, 1);
    const setupSql = "CREATE SECRET s (TYPE ICEBERG, TOKEN 'token')";
    const attachSql = "ATTACH 'warehouse' AS iceberg_db (TYPE ICEBERG, SECRET s)";

    await pool.query(attachSql);
    pool.registerGlobalAttach('iceberg_db', attachSql, [setupSql]);
    await pool.query('SELECT * FROM iceberg_db.main.t');

    expect(connections[0].calls.filter((call) => call === attachSql)).toHaveLength(1);
    expect(connections[0].calls).not.toContain(setupSql);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();

    const setupIndex = connections[1].calls.indexOf(setupSql);
    const attachIndex = connections[1].calls.indexOf(attachSql);
    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeGreaterThan(setupIndex);
  });

  it('replays registered DETACH statements onto background connections', async () => {
    const { pool, connections } = makePool(4, 1);

    pool.registerGlobalAttach('remote_db', "ATTACH '/tmp/remote.duckdb' AS remote_db");
    await pool.query('SELECT 1');
    pool.registerGlobalDetach('remote_db');
    await pool.query('SELECT 2');

    expect(connections[0].calls).toContain('DETACH remote_db');
    expect(connections[0].databases.has('remote_db')).toBe(false);
  });

  it('records pool-level ATTACH statements for later pinned script connections', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH '/tmp/local.duckdb' AS local_db");

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT * FROM local_db.main.t');
    await pinned.close();

    expect(connections[1].calls).toContain("ATTACH '/tmp/local.duckdb' AS local_db");
    expect(connections[1].calls).toContain('SELECT * FROM local_db.main.t');
  });

  it('records ATTACH statements with options for later pinned script connections', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH '/tmp/local.duckdb' AS local_db (READ_ONLY)");

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT 1');
    await pinned.close();

    expect(connections[1].calls).toContain("ATTACH '/tmp/local.duckdb' AS local_db (READ_ONLY)");
  });

  it('records AS-less MotherDuck ATTACH statements for later pinned script connections', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH IF NOT EXISTS 'md:'");

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT 1');
    await pinned.close();

    expect(connections[1].calls).toContain("ATTACH IF NOT EXISTS 'md:'");
  });

  it('replays registered MotherDuck database ATTACH statements for later pinned script connections', async () => {
    const { pool, connections } = makePool(4, 1);

    pool.registerGlobalAttach('md:', "ATTACH IF NOT EXISTS 'md:'");
    pool.registerGlobalAttach('pp_db2', "ATTACH IF NOT EXISTS 'md:pp_db2'");
    await pool.query('SELECT 0');

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT 1');
    await pinned.close();

    const handshakeIndex = connections[1].calls.indexOf("ATTACH IF NOT EXISTS 'md:'");
    const dbAttachIndex = connections[1].calls.indexOf("ATTACH IF NOT EXISTS 'md:pp_db2'");
    expect(handshakeIndex).toBeGreaterThanOrEqual(0);
    expect(dbAttachIndex).toBeGreaterThan(handshakeIndex);
  });

  it('does not detach an already-attached MotherDuck database while reconciling', async () => {
    const { pool, connections } = makePool(4, 1);

    const background = await pool.getBackgroundConnection();
    connections[0].databases.add('my_db');
    connections[0].currentDatabase = 'my_db';
    await background.close();

    pool.registerGlobalAttach('my_db', "ATTACH IF NOT EXISTS 'md:my_db'");
    await pool.query('SELECT 1');

    expect(connections[0].calls).not.toContain('USE memory;');
    expect(connections[0].calls).not.toContain('DETACH my_db');
    expect(connections[0].calls).not.toContain("ATTACH IF NOT EXISTS 'md:my_db'");
    expect(connections[0].currentDatabase).toBe('my_db');
  });

  it('does not replay a registered ATTACH on the connection that already ran it', async () => {
    const { pool, connections } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query("ATTACH '/tmp/local.duckdb' AS local_db");
    await pinned.query('USE local_db');
    pool.registerGlobalAttach('local_db', "ATTACH '/tmp/local.duckdb' AS local_db", [], {
      appliedTabId: tabId('tab-a'),
    });
    await pinned.close();

    const result = await pool.queryAbortableForTab(
      tabId('tab-a'),
      'SELECT * FROM t',
      new AbortController().signal,
    );

    expect(result.aborted).toBe(false);
    const pinnedConnection = connections[(pool as any)._pinnedTabs.get(tabId('tab-a'))];
    expect(pinnedConnection.calls.filter((call) => call.includes('ATTACH'))).toEqual([
      "ATTACH '/tmp/local.duckdb' AS local_db",
    ]);
    expect(pinnedConnection.calls).not.toContain('DETACH local_db');
    expect(pinnedConnection.currentDatabase).toBe('local_db');
  });

  it('does not mark stale pinned connections current when they apply a later mutation', async () => {
    const { pool, connections } = makePool(4, 1);
    const siblingAttach = "ATTACH '/tmp/sibling.duckdb' AS sibling_db";
    const ownAttach = "ATTACH '/tmp/own.duckdb' AS own_db";

    const pinned = await pool.pinForTab(tabId('tab-a'));
    pool.registerGlobalAttach('sibling_db', siblingAttach);
    await pinned.query(ownAttach);
    pool.registerGlobalAttach('own_db', ownAttach, [], { appliedTabId: tabId('tab-a') });
    await pinned.close();

    const reused = await pool.pinForTab(tabId('tab-a'));
    await reused.close();

    expect(connections[1].calls).toContain(siblingAttach);
    expect(connections[1].calls.filter((call) => call === ownAttach)).toHaveLength(1);
  });

  it('does not replay an already-applied AS-less MotherDuck ATTACH after later catalog changes', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH IF NOT EXISTS 'md:'");
    await pool.query("ATTACH '/tmp/other.duckdb' AS other_db");
    pool.registerGlobalDetach('missing_db');
    await pool.query('SELECT 1');

    expect(
      connections[0].calls.filter((call) => call === "ATTACH IF NOT EXISTS 'md:'"),
    ).toHaveLength(1);
  });

  it('replays plain MotherDuck database detaches on hydrated connections', async () => {
    const { pool, connections } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    connections[1].databases.add('sample_md_db');
    await pinned.close();

    pool.registerGlobalDetach('sample_md_db');
    pool.registerGlobalDetach('md:');

    const reused = await pool.pinForTab(tabId('tab-a'));
    await reused.close();

    expect(connections[1].calls).toContain('DETACH sample_md_db');
    expect(connections[1].databases.has('sample_md_db')).toBe(false);
  });

  it('records pool-level DETACH IF EXISTS statements', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH '/tmp/local.duckdb' AS local_db");
    await pool.query('DETACH DATABASE IF EXISTS local_db');

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT 1');
    await pinned.close();

    expect(connections[1].calls).not.toContain("ATTACH '/tmp/local.duckdb' AS local_db");
  });

  it('does not record catalog mutations from SQL string literals', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH '/tmp/local.duckdb' AS local_db");
    await pool.query("SELECT 'DETACH local_db'");

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('SELECT 1');
    await pinned.close();

    expect(connections[1].calls).toContain("ATTACH '/tmp/local.duckdb' AS local_db");
  });

  it('switches away from the current catalog before replaying DETACH', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query("ATTACH '/tmp/local.duckdb' AS local_db");

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.query('USE local_db');
    await pinned.close();

    pool.registerGlobalDetach('local_db');

    const reused = await pool.pinForTab(tabId('tab-a'));
    await reused.close();

    const pinnedConnection = connections[1];
    expect(pinnedConnection.calls).toContain('USE memory;');
    expect(pinnedConnection.calls).toContain('DETACH local_db');
    expect(pinnedConnection.databases.has('local_db')).toBe(false);
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

  it('keeps concurrent first pins within the pinnable LRU limit', async () => {
    const { pool } = makePool(3, 1);

    await Promise.all(
      [tabId('tab-a'), tabId('tab-b'), tabId('tab-c')].map(async (id) => {
        const pinned = await pool.pinForTab(id);
        await pinned.close();
      }),
    );

    expect((pool as any)._pinnedTabs.size).toBe(2);
    expect(Array.from((pool as any)._pinnedTabs.keys())).toEqual([tabId('tab-b'), tabId('tab-c')]);
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

  it('does not rerun tab hydration callback for helper queries on an already pinned tab', async () => {
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
    expect(hydrated).toEqual([]);
  });

  it('runs the tab hydration callback when a helper query creates a missing pin', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    const result = await pool.queryAbortableForTab(
      tabId('tab-a'),
      'SELECT 1',
      new AbortController().signal,
    );

    expect(result.aborted).toBe(false);
    expect(hydrated).toEqual([tabId('tab-a')]);
  });

  it('can pin an existing tab without replaying pending session hydration', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    hydrated.length = 0;

    const reused = await pool.pinForTab(tabId('tab-a'), { replaySession: false });
    await reused.close();

    expect(hydrated).toEqual([]);
  });

  it('hydrates missing pins for data operations without replaying existing pins', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    const created = await pool.pinForTabDataOperation(tabId('tab-a'));
    await created.close();

    expect(hydrated).toEqual([tabId('tab-a')]);
    hydrated.length = 0;

    const reused = await pool.pinForTabDataOperation(tabId('tab-a'));
    await reused.close();

    expect(hydrated).toEqual([]);
  });

  it('replays the session when the pin is evicted before a data operation claims it', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    // Establish the pin; hydration replays the session once.
    const initial = await pool.pinForTabDataOperation(tabId('tab-a'));
    await initial.close();
    expect(hydrated).toEqual([tabId('tab-a')]);
    hydrated.length = 0;

    // Reproduce the race: the pin is evicted in the window between hydration
    // and the final claim. `pinForTabDataOperation` calls `_closePinnedReader`
    // in that window, so a tracked reader whose close() unpins the tab drops
    // the pin (and replaces its connection) at exactly that point.
    (pool as any)._pinnedReaders.set(tabId('tab-a'), {
      closed: false,
      async close() {
        this.closed = true;
        await pool.unpinTab(tabId('tab-a'));
      },
    });

    const conn = await pool.pinForTabDataOperation(tabId('tab-a'));
    await conn.close();

    // The pin had to be recreated on a fresh connection, so the session MUST be
    // replayed — otherwise the data op runs against the default catalog/schema.
    expect(hydrated).toEqual([tabId('tab-a')]);
  });

  it('replays the session when catalog reconciliation switches the surviving pin off its catalog', async () => {
    const hydrated: TabId[] = [];
    const { pool, connections } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id, conn) => {
        hydrated.push(id);
        // The real hook restores the tab's catalog/schema via USE.
        await (conn as unknown as FakeConnection).query('USE local_db;');
      },
    });

    // Pin tab-a against catalog version 1. The first claim hydrates the
    // session, leaving the connection on local_db.
    pool.registerGlobalAttach('local_db', "ATTACH '/tmp/a.duckdb' AS local_db");
    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    expect(hydrated).toEqual([tabId('tab-a')]);
    hydrated.length = 0;

    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));
    expect(connections[index].currentDatabase).toBe('local_db');

    // Another writer re-attaches the same alias with different SQL → version
    // bump. The surviving pin is now behind and will detach (USE memory) and
    // reattach local_db on its next claim.
    pool.registerGlobalAttach('local_db', "ATTACH '/tmp/b.duckdb' AS local_db");

    // A data operation claims with replaySession:false. Because reconciliation
    // switched the connection off local_db, the session MUST be replayed —
    // otherwise the data op silently runs against `memory`.
    const dataConn = await pool.pinForTabDataOperation(tabId('tab-a'));
    await dataConn.close();

    expect(hydrated).toEqual([tabId('tab-a')]);
    expect(connections[index].currentDatabase).toBe('local_db');
  });

  it('fails fast instead of binding a replaced connection when a pin disappears mid-claim', async () => {
    const { pool } = makePool(4, 1);

    // Pin tab-a and keep the connection open so the slot stays in use, forcing
    // a concurrent claim to poll rather than acquire immediately.
    const held = await pool.pinForTab(tabId('tab-a'));
    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));
    expect((pool as any)._inUse.has(index)).toBe(true);

    // Start a second claim; its first iteration sees the slot in use and waits.
    const claimPromise = (pool as any)._claimPinnedTab(tabId('tab-a'), { replaySession: false });

    // While it waits, the pin is evicted. The next poll iteration must observe
    // the pin is gone and throw rather than bind the (now foreign) slot index.
    (pool as any)._pinnedTabs.delete(tabId('tab-a'));

    await expect(claimPromise).rejects.toThrow('does not have a pinned DuckDB connection');

    await held.close();
  });

  it('does not claim a tombstoned pinned slot for a data operation', async () => {
    const { pool } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));

    // Reproduce the `_removeConnection` window: the slot is tombstoned and
    // released from `_inUse`, but the pin mapping is still present.
    (pool as any)._deadIndices.add(index);
    (pool as any)._inUse.delete(index);

    // The try-claim path must treat the dead slot as unavailable rather than
    // binding the closing connection.
    expect(await pool.tryPinForTabDataOperation(tabId('tab-a'))).toBeNull();
  });

  it('does not bind a tombstoned pinned slot while a reclaim is in flight', async () => {
    const { pool } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));

    (pool as any)._deadIndices.add(index);
    (pool as any)._inUse.delete(index);

    // The blocking claim must skip the dead slot and poll; once the reclaim
    // drops the pin mapping it fails fast instead of binding the dead slot.
    const claim = (pool as any)._claimPinnedTab(tabId('tab-a'), { replaySession: false });
    (pool as any)._pinnedTabs.delete(tabId('tab-a'));
    await expect(claim).rejects.toThrow('does not have a pinned DuckDB connection');
  });

  it('closes an open pinned reader before running a tab helper query', async () => {
    const { pool, connections } = makePool(4, 1);

    const reader = await pool.sendAbortableForTab(
      tabId('tab-a'),
      'SELECT * FROM large_result',
      new AbortController().signal,
      true,
    );

    expect(reader?.closed).toBe(false);

    const result = await pool.queryAbortableForTab(
      tabId('tab-a'),
      'SELECT count(*) FROM large_result',
      new AbortController().signal,
    );

    expect(result.aborted).toBe(false);
    expect(reader?.closed).toBe(true);
    expect(connections[(pool as any)._pinnedTabs.get(tabId('tab-a'))].calls).toEqual([
      'cancelSent',
      'SELECT * FROM large_result',
      'cancelSent',
      'SELECT count(*) FROM large_result',
    ]);
  });

  it('closes an open pinned reader before claiming a data-operation connection', async () => {
    const { pool, connections } = makePool(4, 1);

    const reader = await pool.sendAbortableForTab(
      tabId('tab-a'),
      'SELECT * FROM large_result',
      new AbortController().signal,
      true,
    );

    expect(reader?.closed).toBe(false);

    const conn = await pool.pinForTabDataOperation(tabId('tab-a'));
    await conn.close();

    expect(reader?.closed).toBe(true);
    expect(connections[(pool as any)._pinnedTabs.get(tabId('tab-a'))].calls).toEqual([
      'cancelSent',
      'SELECT * FROM large_result',
      'cancelSent',
      'cancelSent',
    ]);
  });

  it('does not hydrate or close readers for non-invasive data-operation claims', async () => {
    const hydrated: TabId[] = [];
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async (id) => {
        hydrated.push(id);
      },
    });

    await expect(pool.tryPinForTabDataOperation(tabId('tab-a'))).resolves.toBeNull();
    expect(hydrated).toEqual([]);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    hydrated.length = 0;

    const reader = await pool.sendAbortableForTab(
      tabId('tab-a'),
      'SELECT * FROM large_result',
      new AbortController().signal,
      true,
    );

    await expect(pool.tryPinForTabDataOperation(tabId('tab-a'))).resolves.toBeNull();
    expect(reader?.closed).toBe(false);
    expect(hydrated).toEqual([]);

    await reader?.close();
  });

  it('resets connection state best-effort even when SET search_path throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, connections } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();

    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));
    const conn = connections[index];
    conn.failQueries = new Set(['SET search_path TO main;']);

    // A throw on the final reset statement must be swallowed so the function
    // stays best-effort and the reclaim path can finish its bookkeeping.
    await expect((pool as any)._resetConnectionState(conn)).resolves.toBeUndefined();
    expect(conn.calls).toContain('SET search_path TO main;');

    warnSpy.mockRestore();
  });

  it('resets connection state best-effort even when cancelSent throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, connections } = makePool(4, 1);

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();

    const index = (pool as any)._pinnedTabs.get(tabId('tab-a'));
    const conn = connections[index];
    conn.failCancel = true;
    conn.calls.length = 0;

    await expect((pool as any)._resetConnectionState(conn)).resolves.toBeUndefined();
    expect(conn.calls).toEqual([
      'cancelSent',
      'ROLLBACK;',
      'USE memory;',
      'SET search_path TO main;',
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to cancel pending DuckDB statements during connection reset:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('reclaims the slot even when the replacement connection fails to initialize', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const connections: FakeConnection[] = [];
    let initCalls = 0;
    const bindings = {
      connect: jest.fn(async () => {
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
      // Fail the replacement connection's initializer (3rd connect: after the
      // background + first pinned connection have already been initialized).
      async () => {
        initCalls += 1;
        if (initCalls === 3) {
          throw new Error('simulated initializer failure');
        }
      },
      { backgroundReservation: 1 },
    );

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    expect((pool as any)._pinnedTabs.size).toBe(1);

    // _replaceConnection throws inside reclaim, but the pin bookkeeping must
    // still run so the slot does not become an unreclaimable phantom.
    await expect(pool.unpinTab(tabId('tab-a'))).resolves.toBeUndefined();

    expect((pool as any)._pinnedTabs.size).toBe(0);
    expect((pool as any)._pinnedLruOrder).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to reset/replace connection while reclaiming pinned slot:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('releases an immediately claimed connection when catalog replay fails', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query('SELECT 1');
    pool.registerGlobalAttach('bad_db', "ATTACH '/tmp/bad.duckdb' AS bad_db");
    connections[0].failQueries = new Set(["ATTACH '/tmp/bad.duckdb' AS bad_db"]);

    await expect(pool.query('SELECT 2')).rejects.toThrow('simulated query failure');

    expect((pool as any)._inUse.size).toBe(0);
  });

  it('does not mark concurrent catalog mutations as replayed on the current pass', async () => {
    const { pool, connections } = makePool(4, 1);

    await pool.query('SELECT warmup');
    pool.registerGlobalAttach('first_db', "ATTACH '/tmp/first.duckdb' AS first_db");

    let registeredConcurrentAttach = false;
    connections[0].onQuery = (sql) => {
      if (sql === "ATTACH '/tmp/first.duckdb' AS first_db" && !registeredConcurrentAttach) {
        registeredConcurrentAttach = true;
        pool.registerGlobalAttach('second_db', "ATTACH '/tmp/second.duckdb' AS second_db");
      }
    };

    await pool.query('SELECT 1');

    expect(connections[0].calls).not.toContain("ATTACH '/tmp/second.duckdb' AS second_db");

    await pool.query('SELECT 2');

    expect(connections[0].calls).toContain("ATTACH '/tmp/second.duckdb' AS second_db");
  });

  it('does not replay session hydration while reclaiming a pinned slot', async () => {
    let hydrateCalls = 0;
    let shouldThrow = false;
    const { pool } = makePool(4, 1, {
      onBeforeTabConnectionUse: async () => {
        hydrateCalls += 1;
        if (shouldThrow) {
          throw new Error('stale session');
        }
      },
    });

    const pinned = await pool.pinForTab(tabId('tab-a'));
    await pinned.close();
    expect(hydrateCalls).toBe(1);

    shouldThrow = true;
    await expect(pool.unpinTab(tabId('tab-a'))).resolves.toBeUndefined();

    expect(hydrateCalls).toBe(1);
    expect((pool as any)._pinnedTabs.size).toBe(0);
  });

  it('tombstones a reclaimed pinned connection in place when replacement fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, connections } = makePool(5, 1);

    const first = await pool.pinForTab(tabId('tab-a'));
    await first.close();
    const second = await pool.pinForTab(tabId('tab-b'));
    await second.close();

    const staleConnection = connections[1];
    const replaceSpy = jest
      .spyOn(pool as any, '_replaceConnection')
      .mockRejectedValueOnce(new Error('simulated replacement failure'));

    await pool.unpinTab(tabId('tab-a'));

    // The broken connection is closed and its slot is tombstoned in place — not
    // spliced — so every other index stays put (see `_removeConnection`).
    expect(staleConnection.closed).toBe(true);
    expect((pool as any)._deadIndices.has(1)).toBe(true);
    expect((pool as any)._connections).toHaveLength(3);
    expect((pool as any)._connections[2]).toBe(connections[2]);
    expect((pool as any)._pinnedTabs.has(tabId('tab-a'))).toBe(false);
    expect((pool as any)._pinnedTabs.get(tabId('tab-b'))).toBe(2);
    expect((pool as any)._inUse.has(1)).toBe(false);

    replaceSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('keeps an outstanding higher-index lease valid when a lower slot is removed', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, connections } = makePool(6, 1);

    // background conn0; tab-a → index 1; tab-b → index 2.
    const a = await pool.pinForTab(tabId('tab-a'));
    await a.close();
    // Hold tab-b's lease open so a higher-index slot is checked out across the
    // removal below. Its onClose closure captured index 2.
    const tabBLease = await pool.pinForTab(tabId('tab-b'));
    expect((pool as any)._pinnedTabs.get(tabId('tab-b'))).toBe(2);
    expect((pool as any)._inUse.has(2)).toBe(true);

    // Remove tab-a's slot (index 1) by failing its replacement during unpin.
    const replaceSpy = jest
      .spyOn(pool as any, '_replaceConnection')
      .mockRejectedValueOnce(new Error('simulated replacement failure'));
    await pool.unpinTab(tabId('tab-a'));
    replaceSpy.mockRestore();

    // tab-b's index did NOT shift, so its still-open lease references the right
    // slot and connection (a splice would have shifted it down to index 1).
    expect((pool as any)._deadIndices.has(1)).toBe(true);
    expect((pool as any)._pinnedTabs.get(tabId('tab-b'))).toBe(2);
    expect((pool as any)._connections[2]).toBe(connections[2]);

    // Closing the lease frees ITS slot. With a splice the closure would have
    // released the wrong (shifted) index and leaked tab-b's real slot.
    await tabBLease.close();
    expect((pool as any)._inUse.has(2)).toBe(false);
    expect((pool as any)._inUse.size).toBe(0);

    warnSpy.mockRestore();
  });

  it('continues closing the pool when one pinned unpin fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, connections } = makePool(5, 1);

    const first = await pool.pinForTab(tabId('tab-a'));
    await first.close();
    const second = await pool.pinForTab(tabId('tab-b'));
    await second.close();

    const originalUnpinTab = pool.unpinTab.bind(pool);
    const unpinSpy = jest
      .spyOn(pool, 'unpinTab')
      .mockRejectedValueOnce(new Error('simulated stuck pin'))
      .mockImplementation(originalUnpinTab);

    await expect(pool.close()).resolves.toBeUndefined();

    expect(unpinSpy).toHaveBeenCalledTimes(2);
    expect(connections.every((conn) => conn.closed)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to unpin DuckDB tab connection during pool close:',
      expect.any(Error),
    );

    unpinSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('serializes concurrent catalog mutations so they cannot interleave', async () => {
    // Reproduces the concurrent-restore race: re-attaching several local
    // databases at once issues ATTACH/DETACH on different pooled connections,
    // and per-connection reconciliation replays the global set. Without
    // serialization these interleave and cross-wire across connections. The
    // catalog mutation queue must run each ATTACH/DETACH (reconcile + execute +
    // register) exclusively, in submission order.
    const connections: FakeConnection[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const attachStarted: string[] = [];

    const bindings = {
      connect: jest.fn(async () => {
        const conn = new FakeConnection(connections.length);
        const runQuery = conn.query.bind(conn);
        conn.query = async (sql: string) => {
          const attach = /ATTACH\s+'[^']*'\s+AS\s+(\w+)/i.exec(sql);
          if (attach) {
            const db = attach[1];
            attachStarted.push(db);
            // Block the first mutation mid-flight while it holds the queue, so
            // we can observe whether the second mutation starts before the
            // first finishes.
            if (db === 'db_a') {
              await firstGate;
            }
          }
          return runQuery(sql);
        };
        connections.push(conn);
        return conn;
      }),
    };

    const pool = new AsyncDuckDBConnectionPool(
      bindings as any,
      6,
      undefined,
      undefined,
      undefined,
      {
        backgroundReservation: 2,
      },
    );

    const first = pool.query("ATTACH 'a.duckdb' AS db_a (READ_ONLY)");
    const second = pool.query("ATTACH 'b.duckdb' AS db_b (READ_ONLY)");

    // Let microtasks settle. The first mutation holds the queue (blocked on
    // firstGate), so the second must not have started its ATTACH yet.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(attachStarted).toEqual(['db_a']);

    releaseFirst();
    await Promise.all([first, second]);

    // The second mutation's ATTACH only ran after the first released the queue
    // (it is never first), and both mutations registered without cross-wiring
    // errors. Reconciliation may re-run an earlier ATTACH while bringing a
    // freshly used connection up to the current catalog version, so we don't
    // assert the exact replay sequence.
    expect(attachStarted[0]).toBe('db_a');
    expect(attachStarted).toContain('db_b');
    expect(Array.from((pool as any)._registeredAttaches.keys()).sort()).toEqual(['db_a', 'db_b']);
  });
});
