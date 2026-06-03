import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { TabId } from '@models/tab';
import { toAbortablePromise } from '@utils/abort';
import {
  parseAttachStatement,
  parseDetachStatement,
  parseIcebergAttachStatement,
  parseMotherDuckAttachStatement,
} from '@utils/attach-parser';
import { toDuckDBIdentifier, type CatalogSchemaSelection } from '@utils/duckdb/identifier';
import { getViteEnv } from '@utils/env';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';

import { AsyncDuckDBPooledConnection } from './duckdb-pooled-connection';
import { AsyncDuckDBPooledStreamReader } from './duckdb-pooled-streaming-reader';
import { PoolTimeoutError } from './timeout-error';

// Optional callback to update persistence state after operations
type UpdateStateFn = () => Promise<void>;

// Default timeout for getting a connection from the pool (ms)
const GET_CONNECTION_TIMEOUT = 10000; // 10 seconds

// Checkpoint configuration interface
export interface CheckpointConfig {
  // Time in ms to throttle checkpoint operations
  throttleMs: number;
  // Maximum number of changes before forcing a checkpoint even if throttle timer hasn't elapsed
  maxChangesBeforeForce: number;
  // Whether to always run a checkpoint when closing the connection pool
  checkpointOnClose: boolean;
  // Whether to log checkpoint operations (in development mode)
  logCheckpoints: boolean;
}

// Default checkpoint configuration
const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  throttleMs: 5000, // 5 seconds
  maxChangesBeforeForce: 100,
  checkpointOnClose: true, // Always checkpoint on close by default
  logCheckpoints: true, // Log checkpoints in development mode
};

type DuckDBConnectionConnAndIndex = { conn: AsyncDuckDBConnection; index: number };
type ConnectionClaimMode = 'background' | 'pinnable' | 'any';
type RegisteredAttach = {
  sql: string;
  setupSql: string[];
  version: number;
};
type RegisterGlobalCatalogMutationOptions = {
  appliedConnection?: AsyncDuckDBConnection;
  appliedTabId?: TabId;
};

export type DuckDBConnectionPoolOptions = {
  backgroundReservation?: number;
  onTabEvicted?: (tabId: TabId) => void;
  onBeforeTabConnectionUse?: (tabId: TabId, conn: AsyncDuckDBConnection) => Promise<void>;
  onTabConnectionSessionRecorded?: (
    tabId: TabId,
    conn: AsyncDuckDBConnection,
    session: CatalogSchemaSelection,
  ) => void;
};

/**
 * DuckDB connection pool.
 *
 * This class provides an abstraction over the DuckDB connection API.
 *
 * It manages a pool of DuckDB connections and directly re-exposes
 * underlying "one-off" connection methods (like query). These methods
 * "own" the connection for the duration of the query, and release it back
 * to the pool when done.
 *
 * For longer living actions, that require locking a connection (send, prepare,
 * or non-streaming but multi statement queries with transactions),
 * it returns a managed wrapper that ensure proper cleanup of the connection.
 *
 * NOTE: currently onlt `send` is implemented, but `prepare` can be added in the
 * same way.
 *
 * NOTE: Connections are created lazily, and the pool will grow to a maximum size.
 * When the maximum is reached, new connections request will wait until
 * a connection is available.
 */
export class AsyncDuckDBConnectionPool {
  /** The maximum number of connection this pool can grow to */
  protected readonly _maxSize: number;
  /** The async duckdb */
  protected readonly _bindings: AsyncDuckDB;
  /** The list of open duckdb connections (pool) */
  protected readonly _connections: AsyncDuckDBConnection[];
  /** The set of connections in use (indexes) */
  protected readonly _inUse: Set<number>;
  /**
   * Indexes whose connection was removed from rotation (tombstoned). The slot
   * is kept in `_connections` so existing indexes never shift — see
   * `_removeConnection`. Dead slots are skipped when claiming and on close, and
   * are never reused, which drops the broken connection and reduces capacity.
   */
  protected readonly _deadIndices: Set<number> = new Set();
  /** Optional callback to update persistence state after operations */
  protected readonly _updateStateCallback?: UpdateStateFn;
  protected readonly _checkpointConfig: CheckpointConfig;
  /** Optional initializer executed for each newly created connection */
  protected readonly _connectionInitializer?: (conn: AsyncDuckDBConnection) => Promise<void>;
  /** Track initialization promises for each connection */
  private readonly _connectionInitPromises: WeakMap<AsyncDuckDBConnection, Promise<void>> =
    new WeakMap();

  private readonly _pinnedTabs: Map<TabId, number> = new Map();
  private readonly _pinnedLruOrder: TabId[] = [];
  private readonly _backgroundReservation: number = 5;
  /**
   * Number of slots at the top of the pinnable region that background work may
   * never claim, so this many pins can always be created without waiting on
   * background load. Mirrors `_backgroundReservation` at the other end of the
   * pool; computed in the constructor and clamped to the pinnable region size.
   */
  private readonly _pinReservation: number = 5;
  private readonly _onTabEvicted?: (tabId: TabId) => void;
  private readonly _onBeforeTabConnectionUse?: (
    tabId: TabId,
    conn: AsyncDuckDBConnection,
  ) => Promise<void>;
  private readonly _onTabConnectionSessionRecorded?: (
    tabId: TabId,
    conn: AsyncDuckDBConnection,
    session: CatalogSchemaSelection,
  ) => void;
  private readonly _pinPromises: Map<TabId, Promise<void>> = new Map();
  private _pinCreationQueue: Promise<void> = Promise.resolve();
  /**
   * Active streaming readers issued for pinned tabs. Tracked so that reclaiming
   * the slot (unpin/eviction) can drain the reader and release the underlying
   * connection without waiting for the pool timeout.
   */
  private readonly _pinnedReaders: Map<TabId, AsyncDuckDBPooledStreamReader<any>> = new Map();
  private readonly _registeredAttaches: Map<string, RegisteredAttach> = new Map();
  private readonly _registeredDetaches: Map<string, number> = new Map();
  private readonly _connectionCatalogVersions: WeakMap<AsyncDuckDBConnection, number> =
    new WeakMap();
  private readonly _connectionAppliedCatalogMutations: WeakMap<AsyncDuckDBConnection, Set<number>> =
    new WeakMap();
  private _catalogVersion = 0;
  /**
   * Serializes catalog-state changes (ATTACH/DETACH execution + registration)
   * and the per-connection reconciliation that depends on them. Because the
   * pool spreads work across many connections and reconciliation replays the
   * global attach/detach set, concurrent catalog mutations (e.g. restoring
   * several local databases at once) would otherwise interleave and cross-wire
   * DETACH/ATTACH across connections. Operations that actually mutate catalog
   * state run exclusively through this queue; the no-op fast path (a connection
   * already at the current version) stays off the queue so steady-state query
   * concurrency is unaffected.
   */
  private _catalogMutationQueue: Promise<unknown> = Promise.resolve();

  // State for checkpoint throttling
  private _lastCheckpointTime: number = 0;
  private _changesSinceLastCheckpoint: number = 0;
  private _checkpointInProgress: boolean = false;

  private async _ensureConnectionInitialized(conn: AsyncDuckDBConnection): Promise<void> {
    if (!this._connectionInitializer) {
      return;
    }

    const existingPromise = this._connectionInitPromises.get(conn);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const initPromise = (async () => {
      await this._connectionInitializer!(conn);
    })();

    this._connectionInitPromises.set(conn, initPromise);

    try {
      await initPromise;
    } catch (error) {
      this._connectionInitPromises.delete(conn);
      throw error;
    }
  }

  private async _databaseExists(conn: AsyncDuckDBConnection, dbName: string): Promise<boolean> {
    try {
      const result = await conn.query(
        `SELECT database_name FROM duckdb_databases() WHERE database_name = ${quote(dbName, { single: true })}`,
      );
      return result.toArray().length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('There must be at least one attached databases')) {
        return false;
      }
      throw error;
    }
  }

  private _isMotherDuckDatabaseAttach(dbName: string, sql: string): boolean {
    const motherDuckAttach = parseMotherDuckAttachStatement(sql);
    return Boolean(motherDuckAttach && motherDuckAttach.dbName === dbName && dbName !== 'md:');
  }

  /**
   * Detach `dbName` from `conn` if it is attached. Returns whether detaching
   * switched the connection off its current catalog (via `USE memory`): when it
   * did, any tab session bound to that catalog is no longer in effect on the
   * connection and must be replayed before the connection is used again.
   */
  private async _detachIfPresent(conn: AsyncDuckDBConnection, dbName: string): Promise<boolean> {
    if (!(await this._databaseExists(conn, dbName))) {
      return false;
    }

    const current = await conn.query('SELECT current_database() AS db');
    const currentDb = (current.toArray()[0] as { db?: string | null } | undefined)?.db ?? null;
    let switchedOffCurrent = false;
    if (currentDb === dbName) {
      await conn.query('USE memory;');
      switchedOffCurrent = true;
    }

    await conn.query(`DETACH ${toDuckDBIdentifier(dbName)}`);
    return switchedOffCurrent;
  }

  /**
   * Reconcile `conn`'s attached catalogs with the globally registered ATTACH/
   * DETACH set. Returns whether reconciliation switched the connection off its
   * current catalog: a `true` result means a pinned tab's saved session
   * (catalog/schema/search_path) no longer applies and must be replayed before
   * the tab's next query, even on a claim that would otherwise skip replay.
   */
  /**
   * Run `fn` exclusively with respect to all other catalog-mutating work
   * (reconciliation and ATTACH/DETACH execution + registration). See
   * `_catalogMutationQueue`.
   */
  private _runSerializedCatalogOp<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._catalogMutationQueue.then(fn, fn);
    // Keep the chain alive regardless of this op's outcome so a single failure
    // can't wedge the queue.
    this._catalogMutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * True when `sql` is an ATTACH/DETACH that mutates the global catalog set.
   * Mirrors the statements `_recordGlobalCatalogMutation` registers.
   */
  private _isCatalogMutation(sql: string): boolean {
    return Boolean(
      parseIcebergAttachStatement(sql)?.catalogAlias ??
        parseAttachStatement(sql)?.dbName ??
        parseMotherDuckAttachStatement(sql)?.dbName ??
        parseDetachStatement(sql),
    );
  }

  /**
   * Reconcile `conn`'s attached catalogs with the globally registered ATTACH/
   * DETACH set. The no-op fast path (connection already at the current version)
   * runs lock-free so steady-state query concurrency is unaffected. When
   * reconciliation has real work to do it must run on the catalog mutation
   * queue so it can't interleave with concurrent ATTACH/DETACH: callers that
   * already hold the queue pass `serialized: true`, everyone else joins it
   * here.
   */
  private async _ensureConnectionCatalogState(
    conn: AsyncDuckDBConnection,
    { serialized = false }: { serialized?: boolean } = {},
  ): Promise<boolean> {
    const connVersion = this._connectionCatalogVersions.get(conn) ?? 0;
    if (connVersion === this._catalogVersion) {
      return false;
    }
    if (serialized) {
      return this._reconcileConnectionCatalog(conn);
    }
    return this._runSerializedCatalogOp(() => this._reconcileConnectionCatalog(conn));
  }

  private async _reconcileConnectionCatalog(conn: AsyncDuckDBConnection): Promise<boolean> {
    const connVersion = this._connectionCatalogVersions.get(conn) ?? 0;
    const targetVersion = this._catalogVersion;
    if (connVersion === targetVersion) {
      return false;
    }
    const appliedMutations = this._connectionAppliedCatalogMutations.get(conn);

    // Set when a detach switches the connection off its current catalog, so
    // callers can restore a pinned tab's session that the detach invalidated.
    let sessionDisturbed = false;

    const registeredAttaches = new Map(
      Array.from(this._registeredAttaches).filter(([, attach]) => attach.version <= targetVersion),
    );
    const registeredDetaches = new Map(
      Array.from(this._registeredDetaches).filter(
        ([dbName, detachVersion]) =>
          detachVersion <= targetVersion && !registeredAttaches.has(dbName),
      ),
    );

    for (const [dbName, detachVersion] of registeredDetaches) {
      if (detachVersion > connVersion && !appliedMutations?.has(detachVersion)) {
        if (await this._detachIfPresent(conn, dbName)) {
          sessionDisturbed = true;
        }
      }
    }

    for (const [dbName, attach] of registeredAttaches) {
      if (appliedMutations?.has(attach.version)) {
        continue;
      }

      if (dbName === 'md:' && attach.version <= connVersion) {
        continue;
      }

      if (attach.version <= connVersion && (await this._databaseExists(conn, dbName))) {
        continue;
      }

      const databaseAlreadyAttached = await this._databaseExists(conn, dbName);

      // MotherDuck can attach account databases as a side effect of the `md:`
      // handshake/background catalog refresh. If we already see that catalog,
      // do not detach it just to replay an idempotent `ATTACH IF NOT EXISTS
      // 'md:<db>'`: tearing down the current MotherDuck catalog can leave the
      // WASM engine with no usable attached database.
      if (databaseAlreadyAttached && this._isMotherDuckDatabaseAttach(dbName, attach.sql)) {
        continue;
      }

      if (attach.version > connVersion) {
        if (await this._detachIfPresent(conn, dbName)) {
          sessionDisturbed = true;
        }
      }

      for (const setupSql of attach.setupSql) {
        try {
          await conn.query(setupSql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.toLowerCase().includes('already exists')) {
            throw error;
          }
        }
      }

      if (!(await this._databaseExists(conn, dbName))) {
        await conn.query(attach.sql);
      }
    }

    this._connectionCatalogVersions.set(conn, targetVersion);
    return sessionDisturbed;
  }

  /**
   * Creates a new DuckDB connection pool
   *
   * @param bindings The DuckDB bindings to use
   * @param maxSize The maximum number of connections in the pool
   * @param updateStateCallback Optional callback to update persistence state after operations
   * @param checkpointConfig Optional configuration for checkpoint behavior
   */
  constructor(
    bindings: AsyncDuckDB,
    maxSize: number,
    updateStateCallback?: UpdateStateFn,
    checkpointConfig?: Partial<CheckpointConfig>,
    connectionInitializer?: (conn: AsyncDuckDBConnection) => Promise<void>,
    options?: DuckDBConnectionPoolOptions,
  ) {
    this._bindings = bindings;
    this._maxSize = maxSize;
    this._connections = [];
    this._inUse = new Set();
    this._updateStateCallback = updateStateCallback;

    // Merge provided config with defaults
    this._checkpointConfig = {
      ...DEFAULT_CHECKPOINT_CONFIG,
      ...checkpointConfig,
    };
    this._connectionInitializer = connectionInitializer;
    this._backgroundReservation = Math.max(
      0,
      Math.min(options?.backgroundReservation ?? 5, Math.max(0, maxSize - 1)),
    );
    // Reserve a matching band for pins at the top of the pinnable region.
    // Clamp to the pinnable region size (`maxSize - backgroundReservation`) so
    // the two reserved bands never overlap and background keeps its floor.
    this._pinReservation = Math.min(
      this._backgroundReservation,
      this._maxSize - this._backgroundReservation,
    );
    this._onTabEvicted = options?.onTabEvicted;
    this._onBeforeTabConnectionUse = options?.onBeforeTabConnectionUse;
    this._onTabConnectionSessionRecorded = options?.onTabConnectionSessionRecorded;
  }

  private _pinnedIndexes(): Set<number> {
    return new Set(this._pinnedTabs.values());
  }

  private _isIndexAllowedForMode(
    index: number,
    mode: ConnectionClaimMode,
    // Callers iterating many connections (e.g. `_claimConnection`) pass a
    // precomputed set so the pinned indexes aren't rebuilt per connection.
    pinnedIndexes: Set<number> = this._pinnedIndexes(),
  ): boolean {
    if (pinnedIndexes.has(index)) return false;
    if (mode === 'any') return true;
    // Background may use its reserved floor plus any idle slot in the shared
    // middle, but never the pin-reserved band at the top of the pinnable
    // region — that band keeps `_pinReservation` slots claimable for pins even
    // under sustained background load.
    if (mode === 'background') return index < this._maxSize - this._pinReservation;
    return index >= this._backgroundReservation;
  }

  private _touchPinnedTab(tabId: TabId): void {
    const existingIndex = this._pinnedLruOrder.indexOf(tabId);
    if (existingIndex >= 0) {
      this._pinnedLruOrder.splice(existingIndex, 1);
    }
    this._pinnedLruOrder.push(tabId);
  }

  private async _claimPinnedTab(
    tabId: TabId,
    // `replayOnCatalogChange` forces a session replay when catalog
    // reconciliation switched the connection off its catalog, even if
    // `replaySession` is false. Reclaim paths opt out: they reset/replace the
    // connection immediately, so restoring the session would be wasted work
    // (and could throw on a catalog that can no longer be reached).
    {
      replaySession = true,
      replayOnCatalogChange = true,
    }: { replaySession?: boolean; replayOnCatalogChange?: boolean } = {},
  ): Promise<DuckDBConnectionConnAndIndex> {
    const startTime = Date.now();
    while (Date.now() - startTime < GET_CONNECTION_TIMEOUT) {
      // Re-read the index every iteration. While we wait for the slot to free
      // up, the pin can be evicted/unpinned and its connection replaced; a
      // stale captured index would bind us to a fresh connection that never had
      // this tab's session replayed (silently wrong catalog/schema). If the pin
      // is gone, fail fast rather than claim a foreign slot.
      const index = this._pinnedTabs.get(tabId);
      if (index === undefined) {
        throw new Error(`Tab ${tabId} does not have a pinned DuckDB connection`);
      }
      // Skip a tombstoned slot: `_removeConnection` clears `_inUse` before it
      // finishes closing the connection and before `_reclaimPinnedSlot` drops
      // the `_pinnedTabs` mapping. Without this guard a concurrent claim could
      // bind the closing connection. Polling lets the teardown finish, after
      // which the pin mapping is gone and the claim fails fast above.
      if (!this._inUse.has(index) && !this._deadIndices.has(index)) {
        this._inUse.add(index);
        const conn = this._connections[index];
        try {
          await this._ensureConnectionInitialized(conn);
          const catalogChanged = await this._ensureConnectionCatalogState(conn);
          if (replaySession || (replayOnCatalogChange && catalogChanged)) {
            await this._onBeforeTabConnectionUse?.(tabId, conn);
          }
          this._touchPinnedTab(tabId);
        } catch (error) {
          await this._releaseConnection(index);
          throw error;
        }
        return { conn, index };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new PoolTimeoutError();
  }

  private async _tryClaimPinnedTab(
    tabId: TabId,
    { replaySession = true }: { replaySession?: boolean } = {},
  ): Promise<DuckDBConnectionConnAndIndex | null> {
    const index = this._pinnedTabs.get(tabId);
    // A tombstoned slot (see `_claimPinnedTab`) is not claimable: its connection
    // is being closed even though `_inUse` no longer holds it.
    if (
      index === undefined ||
      this._inUse.has(index) ||
      this._deadIndices.has(index) ||
      this._pinnedReaders.has(tabId)
    ) {
      return null;
    }

    this._inUse.add(index);
    const conn = this._connections[index];
    try {
      await this._ensureConnectionInitialized(conn);
      const catalogChanged = await this._ensureConnectionCatalogState(conn);
      if (replaySession || catalogChanged) {
        await this._onBeforeTabConnectionUse?.(tabId, conn);
      }
      this._touchPinnedTab(tabId);
      return { conn, index };
    } catch (error) {
      await this._releaseConnection(index);
      throw error;
    }
  }

  /**
   * Release whatever is currently holding a pinned tab's connection slot so
   * the slot can be reclaimed. Closes any tracked streaming reader (which
   * fires its onClose → releases the connection) and otherwise cancels any
   * in-flight query.
   *
   * Without this, reclaim paths (unpin/eviction) would poll `_claimPinnedTab`
   * until `GET_CONNECTION_TIMEOUT` while the previous holder sits idle on an
   * unfinished reader or a long-running query.
   */
  private async _drainPinnedTabSlot(tabId: TabId, index: number): Promise<void> {
    const reader = this._pinnedReaders.get(tabId);
    if (reader) {
      try {
        await reader.close();
      } catch (error) {
        console.warn('Failed to close pinned reader during tab reclaim:', error);
      }
    }

    if (this._inUse.has(index)) {
      try {
        await this._connections[index].cancelSent();
      } catch (error) {
        console.warn('Failed to cancel in-flight query during tab reclaim:', error);
      }
    }
  }

  private async _closePinnedReader(tabId: TabId): Promise<void> {
    const reader = this._pinnedReaders.get(tabId);
    if (reader) {
      this._pinnedReaders.delete(tabId);
      await reader.close();
    }
  }

  /**
   * Reclaim a pinned slot so it can be reused: drain whatever holds the slot,
   * reset and replace the underlying connection so no session state leaks, then
   * drop all pin bookkeeping.
   *
   * If replacement fails, remove the old connection from the pool instead of
   * releasing it. Reset is best-effort and cannot clear all connection-scoped
   * state (for example temp tables), so a failed replacement must not let the
   * evicted tab's session leak into later work.
   */
  private async _reclaimPinnedSlot(tabId: TabId, index: number): Promise<void> {
    await this._drainPinnedTabSlot(tabId, index);

    await this._claimPinnedTab(tabId, { replaySession: false, replayOnCatalogChange: false });
    let releaseClaim = true;
    try {
      try {
        await this._resetConnectionState(this._connections[index]);
        await this._replaceConnection(index);
      } catch (error) {
        console.warn('Failed to reset/replace connection while reclaiming pinned slot:', error);
        await this._removeConnection(index);
        releaseClaim = false;
      }
      this._pinnedTabs.delete(tabId);
      const lruIndex = this._pinnedLruOrder.indexOf(tabId);
      if (lruIndex >= 0) this._pinnedLruOrder.splice(lruIndex, 1);
    } finally {
      if (releaseClaim) {
        await this._releaseConnection(index);
      }
    }
  }

  private async _evictLeastRecentlyUsedPinnedTab(): Promise<void> {
    // Peek (don't shift) the LRU head: if reclaim throws before the bookkeeping
    // runs (e.g. `_claimPinnedTab` times out on a stuck slot), the tab stays
    // consistently present in both `_pinnedTabs` and the LRU order instead of
    // becoming a phantom pin.
    const tabId = this._pinnedLruOrder[0];
    if (!tabId) return;

    const index = this._pinnedTabs.get(tabId);
    if (index === undefined) {
      // Stale LRU entry with no matching pin: drop it and bail.
      this._pinnedLruOrder.shift();
      return;
    }

    await this._reclaimPinnedSlot(tabId, index);
    this._onTabEvicted?.(tabId);
  }

  private async _resetConnectionState(conn: AsyncDuckDBConnection): Promise<void> {
    try {
      await conn.cancelSent();
    } catch (error) {
      console.warn('Failed to cancel pending DuckDB statements during connection reset:', error);
    }
    // ROLLBACK must run before USE: DuckDB rejects catalog changes inside an
    // active transaction, so if the previous holder left one open, USE memory
    // would silently fail and leave the connection in an inconsistent state.
    try {
      await conn.query('ROLLBACK;');
    } catch {
      // No active transaction: DuckDB reports an error, but reset should remain best-effort.
    }
    try {
      await conn.query('USE memory;');
    } catch (error) {
      console.warn('Failed to reset DuckDB connection catalog to memory:', error);
    }
    // Best-effort like the statements above: a throw here (e.g. the catalog
    // reset already invalidated the available schemas) must not propagate out
    // of the reclaim path, otherwise the pin bookkeeping cleanup is skipped and
    // the slot becomes a phantom pin that can never be evicted again.
    try {
      await conn.query('SET search_path TO main;');
    } catch (error) {
      console.warn('Failed to reset DuckDB connection search_path:', error);
    }
  }

  private async _replaceConnection(index: number): Promise<void> {
    const oldConn = this._connections[index];
    const newConn = await this._bindings.connect();

    try {
      await this._ensureConnectionInitialized(newConn);
    } catch (error) {
      await newConn.close().catch((closeError) => {
        console.warn('Failed to close replacement connection after initializer error:', closeError);
      });
      throw error;
    }

    this._connections[index] = newConn;
    await oldConn.close();
  }

  private async _removeConnection(index: number): Promise<void> {
    const conn = this._connections[index];

    // Tombstone the slot instead of splicing it out. Outstanding pooled
    // connections capture their slot index in their onClose closure; splicing
    // would shift every higher index and make those closures release (and
    // FORCE CHECKPOINT) the wrong connection while leaking the real slot.
    // Keeping the slot in place leaves all indexes stable. The dead slot is
    // skipped when claiming and on close and is never reused, which both drops
    // the broken connection from rotation and reduces pool capacity by one.
    this._deadIndices.add(index);
    this._inUse.delete(index);

    try {
      await conn.close();
    } catch (error) {
      console.warn('Failed to close removed DuckDB connection:', error);
    }
  }

  /**
   * Claims (finds and marks as in use) a connection from the pool if one is available.
   */
  _claimConnection(mode: ConnectionClaimMode = 'any'): DuckDBConnectionConnAndIndex | null {
    // Compute the pinned indexes once for the whole scan rather than rebuilding
    // the set for every connection inside `find`.
    const pinnedIndexes = this._pinnedIndexes();

    // Find the first connection that is not in use
    const available = this._connections
      .map((conn, index) => ({
        conn,
        index,
      }))
      .find(
        (_, index) =>
          !this._inUse.has(index) &&
          !this._deadIndices.has(index) &&
          this._isIndexAllowedForMode(index, mode, pinnedIndexes),
      );

    // If a connection is not found, return null
    if (!available) {
      return null;
    }

    // If a connection is found, create a pooled connection object
    const { index } = available;
    this._inUse.add(index);
    return available;
  }

  /**
   * Get a connection from the pool. If no connection is available,
   * a new one will be created.
   *
   * @returns {Promise<AsyncDuckDBPooledConnection>} A promise that resolves to a pooled connection.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   */
  async _getConnection(
    mode: ConnectionClaimMode = 'any',
    // When true, skip catalog reconciliation during acquisition. Used by the
    // catalog-mutation path, which claims a connection lock-free and then runs
    // reconciliation itself inside the catalog mutation queue (claiming under
    // the queue could deadlock against connections waiting for the queue).
    { deferCatalogReconcile = false }: { deferCatalogReconcile?: boolean } = {},
  ): Promise<DuckDBConnectionConnAndIndex> {
    // Try claiming a connection from the pool
    const available = this._claimConnection(mode);

    if (available) {
      try {
        await this._ensureConnectionInitialized(available.conn);
        if (!deferCatalogReconcile) {
          await this._ensureConnectionCatalogState(available.conn);
        }
        return available;
      } catch (error) {
        await this._releaseConnection(available.index);
        throw error;
      }
    }

    // If no connection is available, create a new one if we still
    // have space in the pool, claim and return it
    if (this._connections.length < this._maxSize) {
      if (mode === 'pinnable') {
        while (this._connections.length < this._backgroundReservation) {
          const backgroundConn = await this._bindings.connect();
          try {
            await this._ensureConnectionInitialized(backgroundConn);
            await this._ensureConnectionCatalogState(backgroundConn);
          } catch (error) {
            await backgroundConn.close().catch((closeError) => {
              console.warn('Failed to close connection after initializer error:', closeError);
            });
            throw error;
          }
          this._connections.push(backgroundConn);
        }
      }

      const conn = await this._bindings.connect();
      try {
        await this._ensureConnectionInitialized(conn);
        if (!deferCatalogReconcile) {
          await this._ensureConnectionCatalogState(conn);
        }
      } catch (error) {
        try {
          await conn.close();
        } catch (closeError) {
          console.warn('Failed to close connection after initializer error:', closeError);
        }
        throw error;
      }
      this._connections.push(conn);

      const index = this._connections.length - 1;
      if (!this._isIndexAllowedForMode(index, mode)) {
        await conn.close();
        this._connections.pop();
      } else {
        this._inUse.add(index);

        return {
          conn,
          index,
        };
      }
    }

    // If the pool is full, wait for a connection to be released up to a timeout
    const startTime = Date.now();
    while (Date.now() - startTime < GET_CONNECTION_TIMEOUT) {
      const availableConn = this._claimConnection(mode);
      if (availableConn) {
        try {
          await this._ensureConnectionInitialized(availableConn.conn);
          if (!deferCatalogReconcile) {
            await this._ensureConnectionCatalogState(availableConn.conn);
          }
        } catch (error) {
          this._releaseConnection(availableConn.index);
          throw error;
        }
        return availableConn;
      }
      // Wait for 100ms before trying again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new PoolTimeoutError();
  }

  /**
   * Release a connection back to the pool.
   *
   * This method doesn't automatically close pending queries! Use
   * with care, either after "one-off" actions, or after cleaning
   * up the connection (cancelling pending queries/statments).
   */
  async _releaseConnection(index: number) {
    try {
      const conn = this._connections[index];

      // If we're in persistent mode, handle potential checkpointing
      if (this._updateStateCallback) {
        // Increment the changes counter
        this._changesSinceLastCheckpoint += 1;

        // Check if we should run a checkpoint based on time or change count
        const now = Date.now();
        const timeSinceLastCheckpoint = now - this._lastCheckpointTime;
        const shouldCheckpoint =
          // Either enough time has passed since last checkpoint
          (timeSinceLastCheckpoint >= this._checkpointConfig.throttleMs &&
            this._changesSinceLastCheckpoint > 0) ||
          // Or we've accumulated enough changes to force a checkpoint
          this._changesSinceLastCheckpoint >= this._checkpointConfig.maxChangesBeforeForce;

        // Only checkpoint if not already in progress and criteria are met
        if (shouldCheckpoint && !this._checkpointInProgress) {
          try {
            // Mark checkpoint as in progress to prevent concurrent checkpoints
            this._checkpointInProgress = true;

            // Log the checkpoint if enabled and in dev mode
            if (this._checkpointConfig.logCheckpoints && getViteEnv().DEV) {
              // eslint-disable-next-line no-console
              console.debug(
                `Running checkpoint after ${this._changesSinceLastCheckpoint} changes`,
                `and ${timeSinceLastCheckpoint}ms since last checkpoint`,
              );
            }

            // Create a checkpoint to ensure data is saved to disk
            // Use FORCE CHECKPOINT to wait for other transactions
            await conn.query('FORCE CHECKPOINT;');

            // Update persistence state
            await this._updateStateCallback();

            // Reset checkpoint tracking state
            this._lastCheckpointTime = now;
            this._changesSinceLastCheckpoint = 0;
          } catch (error) {
            console.error('Error during checkpoint or persistence state update:', error);

            // We don't rethrow the error to ensure the connection is always released,
            // but at least the error is logged for debugging purposes
          } finally {
            // Always mark checkpoint as no longer in progress
            this._checkpointInProgress = false;
          }
        }
      }
    } catch (error) {
      console.error('Unexpected error in _releaseConnection:', error);
    } finally {
      // Always mark the connection as not in use, even if there was an error
      this._inUse.delete(index);
    }
  }

  /**
   * Force a checkpoint to ensure all data is persisted
   * This is useful to explicitly call before important operations
   * or when the user explicitly requests a save
   *
   * @returns Promise<boolean> True if checkpoint succeeded, false otherwise
   */
  public async forceCheckpoint(): Promise<boolean> {
    // If there's no update callback or no connections, we can't checkpoint
    if (!this._updateStateCallback || this._connections.length === 0) {
      return false; // Nothing to checkpoint
    }

    // If a checkpoint is already in progress, wait a bit and return
    if (this._checkpointInProgress) {
      if (this._checkpointConfig.logCheckpoints && getViteEnv().DEV) {
        // eslint-disable-next-line no-console
        console.debug('Checkpoint already in progress, skipping forced checkpoint');
      }

      // Still return true since a checkpoint is happening
      return true;
    }

    try {
      // Set checkpoint in progress flag to prevent concurrent checkpoints
      this._checkpointInProgress = true;

      // Log the forced checkpoint if enabled
      if (this._checkpointConfig.logCheckpoints && getViteEnv().DEV) {
        // eslint-disable-next-line no-console
        console.debug('Running forced checkpoint');
      }

      // Get any available connection or wait for one
      const { conn, index } = await this._getConnection();

      try {
        // Create a checkpoint
        // Use FORCE CHECKPOINT to wait for other transactions
        await conn.query('FORCE CHECKPOINT;');

        // Update persistence state
        await this._updateStateCallback();

        // Reset checkpoint tracking state
        this._lastCheckpointTime = Date.now();
        this._changesSinceLastCheckpoint = 0;

        return true;
      } catch (error) {
        // Provide more specific error context
        console.error('Error during forced checkpoint operation:', error);
        return false;
      } finally {
        // Always release the connection
        await this._releaseConnection(index);
      }
    } catch (error) {
      console.error('Error acquiring connection for forced checkpoint:', error);
      return false;
    } finally {
      // Always clear the checkpoint in progress flag
      this._checkpointInProgress = false;
    }
  }

  /**
   * Gracefully close the pool and all connections.
   * Performs a final checkpoint if configured to do so and there are pending changes.
   */
  public async close() {
    for (const tabId of Array.from(this._pinnedTabs.keys())) {
      try {
        await this.unpinTab(tabId);
      } catch (error) {
        console.warn('Failed to unpin DuckDB tab connection during pool close:', error);
      }
    }

    // Try to do a final checkpoint before closing
    try {
      // Only checkpoint if it's enabled in the configuration AND we have changes to save
      if (
        this._checkpointConfig.checkpointOnClose &&
        this._updateStateCallback &&
        this._connections.length > 0 &&
        this._changesSinceLastCheckpoint > 0
      ) {
        if (this._checkpointConfig.logCheckpoints && getViteEnv().DEV) {
          // eslint-disable-next-line no-console
          console.debug(
            `Running final checkpoint before close with ${this._changesSinceLastCheckpoint} pending changes`,
          );
        }
        await this.forceCheckpoint();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error during final checkpoint:', error);
    }

    // Close all connections. Dead (tombstoned) slots hold an already-closed
    // connection, so skip them to avoid double-closing.
    await Promise.all(
      this._connections
        .filter((_, index) => !this._deadIndices.has(index))
        .map((conn) => conn.close()),
    );
    this._connections.length = 0;
    this._deadIndices.clear();
  }

  /**
   * Get a long-living pooled connection.
   *
   * Code-review guard: new direct callers should be challenged. Use
   * `pinForTab` for script execution and `getBackgroundConnection` for
   * background work so per-tab session state stays isolated.
   *
   * @returns A promise that resolves to a pooled connection object.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async getPooledConnection(): Promise<AsyncDuckDBPooledConnection> {
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    try {
      // Return a pooled connection
      return new AsyncDuckDBPooledConnection({
        conn,
        onClose: async () => {
          // Release the connection back to the pool
          this._releaseConnection(index);
        },
      });
    } catch (error) {
      // Release the connection back to the pool
      this._releaseConnection(index);
      throw error;
    }
  }

  public async pinForTab(
    tabId: TabId,
    { replaySession = true }: { replaySession?: boolean } = {},
  ): Promise<AsyncDuckDBPooledConnection> {
    if (this._pinnedTabs.has(tabId)) {
      const { conn, index } = await this._claimPinnedTab(tabId, { replaySession });
      return new AsyncDuckDBPooledConnection({
        conn,
        onClose: async () => {
          await this._releaseConnection(index);
        },
      });
    }

    const pendingPin = this._pinPromises.get(tabId);
    if (pendingPin) {
      await pendingPin;
      return this.pinForTab(tabId, { replaySession });
    }

    const runPin = async () => {
      if (this._pinnedTabs.has(tabId)) {
        return;
      }

      const pinnableLimit = this._maxSize - this._backgroundReservation;
      if (this._pinnedTabs.size >= pinnableLimit) {
        await this._evictLeastRecentlyUsedPinnedTab();
      }

      // Pin creation is serialized through `_pinCreationQueue` and
      // `_getConnection('pinnable')` never adds to `_pinnedTabs`, so the size
      // can only shrink (via unpin) between the eviction above and here — one
      // eviction is sufficient to stay within `pinnableLimit`.
      const { index } = await this._getConnection('pinnable');
      this._pinnedTabs.set(tabId, index);
      this._touchPinnedTab(tabId);
      await this._releaseConnection(index);
    };

    const pinPromise = this._pinCreationQueue.then(runPin, runPin);
    this._pinCreationQueue = pinPromise.catch(() => undefined);

    this._pinPromises.set(tabId, pinPromise);

    try {
      await pinPromise;
    } finally {
      this._pinPromises.delete(tabId);
    }

    return this.pinForTab(tabId, { replaySession });
  }

  private async _ensurePinnedTabHydrated(tabId: TabId): Promise<void> {
    if (!this._pinnedTabs.has(tabId)) {
      const pinned = await this.pinForTab(tabId);
      await pinned.close();
    }
  }

  public async pinForTabDataOperation(tabId: TabId): Promise<AsyncDuckDBPooledConnection> {
    await this._ensurePinnedTabHydrated(tabId);
    await this._closePinnedReader(tabId);
    // Hydration above replays the session when it has to create the pin. If the
    // pin was instead evicted/unpinned in the meantime, `pinForTab` recreates it
    // on a fresh connection, so the session must be replayed — otherwise the
    // data op runs against the default catalog/schema and silently returns the
    // wrong rows. When the pin survived, its connection already carries the
    // session, so skip the (costly) replay as before.
    const replaySession = !this._pinnedTabs.has(tabId);
    return this.pinForTab(tabId, { replaySession });
  }

  public async tryPinForTabDataOperation(
    tabId: TabId,
  ): Promise<AsyncDuckDBPooledConnection | null> {
    const claimed = await this._tryClaimPinnedTab(tabId, { replaySession: false });
    if (!claimed) return null;

    const { conn, index } = claimed;
    return new AsyncDuckDBPooledConnection({
      conn,
      onClose: async () => {
        await this._releaseConnection(index);
      },
    });
  }

  public recordPinnedTabConnectionSession(tabId: TabId, session: CatalogSchemaSelection): void {
    const index = this._pinnedTabs.get(tabId);
    if (index === undefined) return;

    const conn = this._connections[index];
    if (!conn) return;

    this._onTabConnectionSessionRecorded?.(tabId, conn, session);
  }

  private _markCatalogMutationApplied(conn: AsyncDuckDBConnection, version: number): void {
    let appliedMutations = this._connectionAppliedCatalogMutations.get(conn);
    if (!appliedMutations) {
      appliedMutations = new Set<number>();
      this._connectionAppliedCatalogMutations.set(conn, appliedMutations);
    }
    appliedMutations.add(version);

    let contiguousVersion = this._connectionCatalogVersions.get(conn) ?? 0;
    while (appliedMutations.has(contiguousVersion + 1)) {
      contiguousVersion += 1;
    }
    this._connectionCatalogVersions.set(conn, contiguousVersion);
  }

  private _markCatalogVersionApplied(
    options: RegisterGlobalCatalogMutationOptions,
    version: number,
  ): void {
    if (options.appliedConnection) {
      this._markCatalogMutationApplied(options.appliedConnection, version);
      return;
    }

    if (options.appliedTabId) {
      const index = this._pinnedTabs.get(options.appliedTabId);
      const conn = index === undefined ? undefined : this._connections[index];
      if (conn) {
        this._markCatalogMutationApplied(conn, version);
      }
    }
  }

  public registerGlobalAttach(
    dbName: string,
    sql: string,
    setupSql: string[] = [],
    options: RegisterGlobalCatalogMutationOptions = {},
  ): void {
    const existing = this._registeredAttaches.get(dbName);
    if (existing?.sql === sql) {
      this._registeredAttaches.set(dbName, {
        ...existing,
        setupSql: setupSql.length > 0 ? setupSql : existing.setupSql,
      });
      this._registeredDetaches.delete(dbName);
      this._markCatalogVersionApplied(options, existing.version);
      return;
    }

    this._catalogVersion += 1;
    const version = this._catalogVersion;
    this._registeredAttaches.set(dbName, {
      sql,
      setupSql,
      version,
    });
    this._registeredDetaches.delete(dbName);
    this._markCatalogVersionApplied(options, version);
  }

  public registerGlobalDetach(
    dbName: string,
    options: RegisterGlobalCatalogMutationOptions = {},
  ): void {
    this._catalogVersion += 1;
    const version = this._catalogVersion;
    this._registeredAttaches.delete(dbName);
    this._registeredDetaches.set(dbName, version);
    this._markCatalogVersionApplied(options, version);
  }

  private _recordGlobalCatalogMutation(
    sql: string,
    appliedConnection: AsyncDuckDBConnection,
  ): void {
    const attach =
      parseIcebergAttachStatement(sql)?.catalogAlias ??
      parseAttachStatement(sql)?.dbName ??
      parseMotherDuckAttachStatement(sql)?.dbName;
    if (attach) {
      this.registerGlobalAttach(attach, sql, [], { appliedConnection });
      return;
    }

    const detach = parseDetachStatement(sql);
    if (detach) {
      this.registerGlobalDetach(detach, { appliedConnection });
    }
  }

  public async unpinTab(tabId: TabId): Promise<void> {
    // If a pin is currently in flight, wait for it to settle so we observe
    // the final pinned state. Without this, a close-during-pin races the
    // pending pin promise and leaks the pinned slot until pool close.
    const pendingPin = this._pinPromises.get(tabId);
    if (pendingPin) {
      try {
        await pendingPin;
      } catch {
        // Pin failed; nothing pinned to unpin.
      }
    }

    const index = this._pinnedTabs.get(tabId);
    if (index === undefined) return;

    await this._reclaimPinnedSlot(tabId, index);
  }

  public async getBackgroundConnection(): Promise<AsyncDuckDBPooledConnection> {
    return this.getPooledConnection();
  }

  public async queryAbortableForTab<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(
    tabId: TabId,
    text: string,
    signal: AbortSignal,
  ): Promise<{ value: arrow.Table<T>; aborted: false } | { value: void; aborted: true }> {
    await this._ensurePinnedTabHydrated(tabId);

    await this._closePinnedReader(tabId);

    const batches = [] as arrow.RecordBatch[];
    const { conn, index } = await this._claimPinnedTab(tabId, { replaySession: false });

    const read = async () => {
      for await (const batch of await conn.send<T>(text, true)) {
        batches.push(batch);
        if (signal.aborted) return new arrow.Table<T>([]);
      }

      return new arrow.Table<T>(batches);
    };

    // Keep a handle on the streaming read so the connection is not released
    // back to the pool while the coroutine is still draining it. On abort,
    // `toAbortablePromise` rejects (and runs `onAbort`/`onFinalize`) without
    // waiting for `read()` to finish, so `onFinalize` must await it; otherwise
    // a subsequent query that claims this same pinned connection would
    // interleave with this one's stream and read a corrupted result.
    const readPromise = read();

    return toAbortablePromise({
      promise: readPromise,
      signal,
      onAbort: async () => {
        await conn.cancelSent();
      },
      onFinalize: async () => {
        await readPromise.catch(() => {});
        await this._releaseConnection(index);
      },
    });
  }

  public async sendAbortableForTab<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(
    tabId: TabId,
    text: string,
    signal: AbortSignal,
    allowStreamResult?: boolean,
  ): Promise<AsyncDuckDBPooledStreamReader<T> | null> {
    await this._ensurePinnedTabHydrated(tabId);

    await this._closePinnedReader(tabId);

    const { conn, index } = await this._claimPinnedTab(tabId, { replaySession: false });

    try {
      const result = await toAbortablePromise({
        promise: conn.send<T>(text, allowStreamResult),
        signal,
      });

      if (result.aborted) {
        await this._releaseConnection(index);
        return null;
      }

      const pooledReader: AsyncDuckDBPooledStreamReader<T> = new AsyncDuckDBPooledStreamReader<T>({
        reader: result.value,
        onClose: async () => {
          if (this._pinnedReaders.get(tabId) === pooledReader) {
            this._pinnedReaders.delete(tabId);
          }
          await conn.cancelSent();
          await this._releaseConnection(index);
        },
      });
      this._pinnedReaders.set(tabId, pooledReader);
      return pooledReader;
    } catch (error) {
      await this._releaseConnection(index);
      throw error;
    }
  }

  // DuckDB Async connection methods re-wrapped, these should have the exact
  // same or compatible APIs

  /** Access the database instance aka bindings */
  public get bindings(): AsyncDuckDBConnection['bindings'] {
    return this._bindings;
  }

  /**
   * Get the unaliased names of all source table used in the query.
   *
   * @param query The SQL query to analyze.
   * @returns array of table names.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async getTableNames(
    ...params: Parameters<AsyncDuckDBConnection['getTableNames']>
  ): ReturnType<AsyncDuckDBConnection['getTableNames']> {
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    try {
      // run the query
      const res = await conn.getTableNames(...params);

      // Return the result
      return res;
    } finally {
      // Release the connection back to the pool
      this._releaseConnection(index);
    }
  }

  /**
   * Query the database using a pooled connection.
   *
   * NOTE: we manually recreate the type of signature here, due to TS constraints
   * on passing generic type vars to return types acquired via subscript
   *
   * @param text The SQL query to execute.
   * @returns A promise that resolves to the result of the query.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async query<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(text: string): Promise<arrow.Table<T>> {
    // Catalog mutations (ATTACH/DETACH) must not interleave with each other or
    // with reconciliation, so run reconcile + execute + register atomically on
    // the catalog mutation queue. The connection is claimed *before* taking the
    // queue so we never hold the queue while waiting for a connection (which
    // could deadlock against connections parked in reconciliation).
    if (this._isCatalogMutation(text)) {
      const { conn, index } = await this._getConnection('background', {
        deferCatalogReconcile: true,
      });
      try {
        return await this._runSerializedCatalogOp(async () => {
          await this._reconcileConnectionCatalog(conn);
          const res = await conn.query<T>(text);
          this._recordGlobalCatalogMutation(text, conn);
          return res;
        });
      } finally {
        this._releaseConnection(index);
      }
    }

    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    try {
      // Reaching here means `_isCatalogMutation(text)` was false above, so this
      // statement registers no global catalog mutation (real ATTACH/DETACH is
      // registered on the serialized branch). Skip the redundant re-parse that
      // `_recordGlobalCatalogMutation` would do on every non-mutation query.
      return await conn.query<T>(text);
    } finally {
      // Release the connection back to the pool
      this._releaseConnection(index);
    }
  }

  /**
   * Similar to `query` - query the database using a pooled connection. But
   * with an abort signal that also "avborting" the query.
   *
   * NOTE: if the query has started, it will really be aborted, but we will
   * the pool will gain one more free connection.
   *
   * @param text The SQL query to execute.
   * @param signal The abort signal to use.
   * @returns A promise that resolves to the result of the query.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async queryAbortable<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(
    text: string,
    signal: AbortSignal,
  ): Promise<{ value: arrow.Table<T>; aborted: false } | { value: void; aborted: true }> {
    // DuckDB-wasm doesn't allow aborting queries started via `query` midway,
    // so we are playing tricks here. We create a streaming reader internally
    // which can be aborted, and just create an arrow table from batches at the end

    const batches = [] as arrow.RecordBatch[];

    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    const read = async () => {
      for await (const batch of await conn.send<T>(text, true)) {
        batches.push(batch);

        // If aborted, immediatelly return an empty table, no point
        // in holding on to batches as they'll be discarded.
        if (signal.aborted) return new arrow.Table<T>([]);
      }

      return new arrow.Table<T>(batches);
    };

    // run the query with abort signal
    const res = await toAbortablePromise({
      promise: read(),
      signal,
      onAbort: async () => {
        await conn.cancelSent();
      },
      onFinalize: async () => {
        // Release the connection back to the pool
        await this._releaseConnection(index);
      },
    });

    return res;
  }

  /**
   * Starts a streaming query using a pooled connection.
   *
   * @param text The SQL query to execute.
   * @returns A promise that resolves to a `AsyncDuckDBPooledStreamReader` instance.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async send<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(text: string, allowStreamResult?: boolean): Promise<AsyncDuckDBPooledStreamReader<T>> {
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    try {
      // Send the query.
      const reader = await conn.send<T>(text, allowStreamResult);

      // Return a pooled reader
      return new AsyncDuckDBPooledStreamReader<T>({
        reader,
        onClose: async () => {
          // cancelPending in the connection in case reader haven't reached the end.
          // Note that DuckDB will return `false` if the query is already done, but
          // we do not check the result.
          await conn.cancelSent();

          // Release the connection back to the pool
          this._releaseConnection(index);
        },
      });
    } catch (error) {
      // Release the connection back to the pool in case of error
      this._releaseConnection(index);
      throw error;
    }
  }

  /**
   * Starts a streaming query using a pooled connection with the ability to abort during
   * initial query creation (which in reality executes the query up-to one data batch,
   * and thus can be pretty slow).
   *
   * @param text The SQL query to execute.
   * @param signal The abort signal to use.
   * @param allowStreamResult Whether to allow streamed results.
   * @returns A promise that resolves to a `AsyncDuckDBPooledStreamReader` instance or null if aborted.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async sendAbortable<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(
    text: string,
    signal: AbortSignal,
    allowStreamResult?: boolean,
  ): Promise<AsyncDuckDBPooledStreamReader<T> | null> {
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection('background');

    try {
      // Send the query with abort signal
      const result = await toAbortablePromise({
        promise: conn.send<T>(text, allowStreamResult),
        signal,
      });

      if (result.aborted) {
        // Release the connection back to the pool if aborted
        this._releaseConnection(index);
        return null;
      }

      // Return a pooled reader
      return new AsyncDuckDBPooledStreamReader<T>({
        reader: result.value,
        onClose: async () => {
          // cancelPending in the connection in case reader haven't reached the end.
          // Note that DuckDB will return `false` if the query is already done, but
          // we do not check the result.
          await conn.cancelSent();

          // Release the connection back to the pool
          this._releaseConnection(index);
        },
      });
    } catch (error) {
      // Release the connection back to the pool in case of error
      this._releaseConnection(index);
      throw error;
    }
  }

  /**
   * Copies a file from the DuckDB virtual file system into a buffer.
   * Used by export operations that write to the DuckDB VFS (e.g. COPY TO).
   *
   * @param fileName The name of the file in the DuckDB VFS to read
   * @returns A promise that resolves to the file contents as a Uint8Array
   */
  public async copyFileToBuffer(fileName: string): Promise<Uint8Array> {
    return this._bindings.copyFileToBuffer(fileName);
  }

  /**
   * Drops (removes) a file from the DuckDB virtual file system.
   *
   * @param fileName The name of the file in the DuckDB VFS to remove
   */
  public async dropFile(fileName: string): Promise<void> {
    await this._bindings.dropFile(fileName);
  }
}
