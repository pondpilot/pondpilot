import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';

class FakeConnection {
  public readonly calls: string[] = [];
  public failQueries?: Set<string>;

  constructor(public readonly id: number) {}

  async query(sql: string) {
    this.calls.push(sql);
    if (this.failQueries?.has(sql)) {
      throw new Error(`simulated query failure: ${sql}`);
    }
    return { toArray: () => [] };
  }

  async cancelSent() {
    return false;
  }

  async close() {
    this.calls.push('close');
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

const THROTTLE_MS = 5000;

const makePool = (checkpointDatabase?: string) => {
  const connections: FakeConnection[] = [];
  const bindings = {
    connect: jest.fn(async () => {
      const conn = new FakeConnection(connections.length);
      connections.push(conn);
      return conn;
    }),
  };
  const updateStateCallback = jest.fn(async () => {});

  const pool = new AsyncDuckDBConnectionPool(bindings as any, 4, updateStateCallback as any, {
    throttleMs: THROTTLE_MS,
    maxChangesBeforeForce: 100,
    checkpointOnClose: false,
    logCheckpoints: false,
    ...(checkpointDatabase ? { checkpointDatabase } : {}),
  });

  return { pool, connections };
};

const checkpointCalls = (connections: FakeConnection[]): number =>
  connections.reduce(
    (sum, conn) => sum + conn.calls.filter((sql) => /FORCE CHECKPOINT/i.test(sql)).length,
    0,
  );

describe('AsyncDuckDBConnectionPool checkpoint scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checkpoints throttled changes via timer even with no further releases', async () => {
    const { pool, connections } = makePool();

    // First write: time-since-last is large (epoch), checkpoints inline.
    await pool.query('CREATE TABLE a AS SELECT 1');
    expect(checkpointCalls(connections)).toBe(1);

    // Second write lands inside the throttle window: inline checkpoint is
    // skipped, so without the timer these changes would never be flushed.
    await pool.query('CREATE TABLE b AS SELECT 1');
    expect(checkpointCalls(connections)).toBe(1);

    // No further pool activity — the deferred timer must fire the checkpoint.
    await jest.advanceTimersByTimeAsync(THROTTLE_MS + 50);
    expect(checkpointCalls(connections)).toBe(2);
  });

  it('coalesces multiple throttled changes into a single deferred checkpoint', async () => {
    const { pool, connections } = makePool();

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    await pool.query('CREATE TABLE b AS SELECT 1'); // throttled -> schedules
    await pool.query('CREATE TABLE c AS SELECT 1'); // throttled -> coalesced
    expect(checkpointCalls(connections)).toBe(1);

    await jest.advanceTimersByTimeAsync(THROTTLE_MS + 50);
    expect(checkpointCalls(connections)).toBe(2);

    // Nothing further pending: no extra checkpoints fire later.
    await jest.advanceTimersByTimeAsync(THROTTLE_MS * 3);
    expect(checkpointCalls(connections)).toBe(2);
  });

  it('flushPendingChanges checkpoints immediately when changes are pending', async () => {
    const { pool, connections } = makePool();

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    await pool.query('CREATE TABLE b AS SELECT 1'); // throttled, pending

    await expect(pool.flushPendingChanges()).resolves.toBe(true);
    expect(checkpointCalls(connections)).toBe(2);

    // No pending changes: resolves true without another checkpoint.
    await expect(pool.flushPendingChanges()).resolves.toBe(true);
    expect(checkpointCalls(connections)).toBe(2);
  });

  it('retries via timer when the deferred checkpoint fails', async () => {
    const { pool, connections } = makePool();

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    await pool.query('CREATE TABLE b AS SELECT 1'); // throttled, pending

    // Make the next FORCE CHECKPOINT fail once.
    for (const conn of connections) {
      conn.failQueries = new Set(['FORCE CHECKPOINT;']);
    }
    await jest.advanceTimersByTimeAsync(THROTTLE_MS + 50);
    expect(checkpointCalls(connections)).toBe(2); // attempted and failed

    for (const conn of connections) {
      conn.failQueries = undefined;
    }
    await jest.advanceTimersByTimeAsync(THROTTLE_MS + 50);
    expect(checkpointCalls(connections)).toBe(3); // retried and succeeded
  });

  it('targets the configured database explicitly, regardless of connection state', async () => {
    const { pool, connections } = makePool('pondpilot');

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    const statements = connections.flatMap((conn) =>
      conn.calls.filter((sql) => /CHECKPOINT/i.test(sql)),
    );
    // A pooled connection may sit on another catalog (e.g. MotherDuck flows
    // reset theirs to `USE memory`) — a bare FORCE CHECKPOINT would no-op for
    // the persistent database, so the target must be named.
    expect(statements).toEqual(['FORCE CHECKPOINT pondpilot;']);
  });

  it('flushPendingChanges also targets the configured database', async () => {
    const { pool, connections } = makePool('pondpilot');

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    await pool.query('CREATE TABLE b AS SELECT 1'); // throttled, pending
    await pool.flushPendingChanges();

    const statements = connections.flatMap((conn) =>
      conn.calls.filter((sql) => /CHECKPOINT/i.test(sql)),
    );
    expect(statements).toEqual(['FORCE CHECKPOINT pondpilot;', 'FORCE CHECKPOINT pondpilot;']);
  });

  it('close clears the deferred checkpoint timer', async () => {
    const { pool, connections } = makePool();

    await pool.query('CREATE TABLE a AS SELECT 1'); // inline checkpoint
    await pool.query('CREATE TABLE b AS SELECT 1'); // throttled -> schedules

    await pool.close();
    const callsAtClose = checkpointCalls(connections);

    await jest.advanceTimersByTimeAsync(THROTTLE_MS * 2);
    expect(checkpointCalls(connections)).toBe(callsAtClose);
  });
});
