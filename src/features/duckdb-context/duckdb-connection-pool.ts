import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { toAbortablePromise } from '@utils/abort';
import * as arrow from 'apache-arrow';

import { AsyncDuckDBPooledConnection } from './duckdb-pooled-conection';
import { AsyncDuckDBPooledStreamReader } from './duckdb-pooled-streaming-reader';
import { PoolTimeoutError } from './timeout-error';

// Should this be a user setting?
const GET_CONNECTION_TIMEOUT = 10000; // 10 seconds

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

  constructor(bindings: AsyncDuckDB, maxSize: number) {
    this._bindings = bindings;
    this._maxSize = maxSize;
    this._connections = [];
    this._inUse = new Set();
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
  _releaseConnection(index: number) {
    // Mark the connection as not in use
    this._inUse.delete(index);
  }

  /**
   * Gracefully close the pool and all connections.
   */
  public async close() {
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
      onFinalize: () => {
        // Release the connection back to the pool
        this._releaseConnection(index);
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
