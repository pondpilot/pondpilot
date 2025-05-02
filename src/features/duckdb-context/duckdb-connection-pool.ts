import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { toAbortablePromise } from '@utils/abort';
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

type DuckDBConnectionConnAndIdex = { conn: AsyncDuckDBConnection; index: number };

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
  /** Optional callback to update persistence state after operations */
  protected readonly _updateStateCallback?: UpdateStateFn;
  protected readonly _checkpointConfig: CheckpointConfig;

  // State for checkpoint throttling
  private _lastCheckpointTime: number = 0;
  private _changesSinceLastCheckpoint: number = 0;
  private _checkpointInProgress: boolean = false;

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
  }

  /**
   * Claims (finds and marks as in use) a connection from the pool if one is available.
   */
  _claimConnection(): DuckDBConnectionConnAndIdex | null {
    // Find the first connection that is not in use
    const available = this._connections
      .map((conn, index) => ({
        conn,
        index,
      }))
      .find((_, index) => !this._inUse.has(index), this);

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
  async _getConnection(): Promise<DuckDBConnectionConnAndIdex> {
    // Try claiming a connection from the pool
    const available = this._claimConnection();

    if (available) {
      return available;
    }

    // If no connection is available, create a new one if we still
    // have space in the pool, claim and return it
    if (this._connections.length < this._maxSize) {
      const conn = await this._bindings.connect();
      this._connections.push(conn);

      const index = this._connections.length - 1;
      this._inUse.add(index);

      return {
        conn,
        index,
      };
    }

    // If the pool is full, wait for a connection to be released up to a timeout
    const startTime = Date.now();
    while (Date.now() - startTime < GET_CONNECTION_TIMEOUT) {
      const availableConn = this._claimConnection();
      if (availableConn) {
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
            if (this._checkpointConfig.logCheckpoints && import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(
                `Running checkpoint after ${this._changesSinceLastCheckpoint} changes`,
                `and ${timeSinceLastCheckpoint}ms since last checkpoint`,
              );
            }

            // Create a checkpoint to ensure data is saved to disk
            await conn.query('CHECKPOINT;');

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
      if (this._checkpointConfig.logCheckpoints && import.meta.env.DEV) {
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
      if (this._checkpointConfig.logCheckpoints && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('Running forced checkpoint');
      }

      // Get any available connection or wait for one
      const { conn, index } = await this._getConnection();

      try {
        // Create a checkpoint
        await conn.query('CHECKPOINT;');

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
    // Try to do a final checkpoint before closing
    try {
      // Only checkpoint if it's enabled in the configuration AND we have changes to save
      if (
        this._checkpointConfig.checkpointOnClose &&
        this._updateStateCallback &&
        this._connections.length > 0 &&
        this._changesSinceLastCheckpoint > 0
      ) {
        if (this._checkpointConfig.logCheckpoints && import.meta.env.DEV) {
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

    // Close all connections
    await Promise.all(this._connections.map((conn) => conn.close()));
    this._connections.length = 0;
  }

  /**
   * Get a long-living pooled connection.
   *
   * @returns A promise that resolves to a pooled connection object.
   * @throws {PoolTimeoutError} If the pool is full and no connection is available within the timeout.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async getPooledConnection(): Promise<AsyncDuckDBPooledConnection> {
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection();

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
    const { conn, index } = await this._getConnection();

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
    // Try to get a connection from the pool
    const { conn, index } = await this._getConnection();

    try {
      // run the query
      const res = await conn.query<T>(text);

      // Return the result
      return res;
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
    const { conn, index } = await this._getConnection();

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
    const { conn, index } = await this._getConnection();

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
    const { conn, index } = await this._getConnection();

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
}
