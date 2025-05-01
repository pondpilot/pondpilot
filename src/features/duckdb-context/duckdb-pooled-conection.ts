import type { AsyncDuckDBConnection, AsyncPreparedStatement } from '@duckdb/duckdb-wasm';
import type * as arrow from 'apache-arrow';

import { AsyncDuckDBPooledPreparedStatement } from './duckdb-pooled-prepared-stmt';
import { AsyncDuckDBPooledStreamReader } from './duckdb-pooled-streaming-reader';

/**
 * A wrapper around the DuckDB connection produced by our pool.
 *
 * This is used when you need to run multiple queries on one connection, and thus
 * can't use the "one-off" `query` method on the pool directly.
 *
 * It re-exposes some of the DuckDB connection methods and self-manages in terms of
 * releasing the connection back to the pool when closed or canceled.
 *
 * It also offers one big advantage over the DuckDB connection API:
 * it will NOT allow runnig a `query` and other APIs while a `send` is in progress.
 *
 * NOTE: most methods whose API is exactly the same as the DuckDB connection
 * will raise an error if the connection is closed!
 */
export class AsyncDuckDBPooledConnection {
  /** The underlying DuckDB connection */
  private _conn: AsyncDuckDBConnection | null;
  /** An arrow stream reader created via send */
  private _reader: AsyncDuckDBPooledStreamReader<any> | null;
  /** A callabck that this reader will call when exhausted/closed/cancelled */
  private _onClose: () => Promise<void>;
  /** An array of created and active prepared statement */
  private _preparedStatement: AsyncPreparedStatement<any> | null;

  constructor({ conn, onClose }: { conn: AsyncDuckDBConnection; onClose: () => Promise<void> }) {
    this._conn = conn;
    this._reader = null;
    this._onClose = onClose;
    this._preparedStatement = null;
  }

  /**
   * If `true`, the connection is "closed", meaning it can't be used anymore.
   *
   * Closed doesn't mean the underlying connection is closed, it is just
   * released back to the pool.
   */
  public get closed(): boolean {
    return this._conn === null;
  }

  _checkActionPreconditions(): void {
    // Check if the connection is closed
    if (!this._conn) {
      throw new Error('Connection is closed');
    }

    if (this._reader) {
      throw new Error('Cannot run a query while a streaming reader is active');
    }

    if (this._preparedStatement) {
      throw new Error('Cannot run a query while a prepared statement is active');
    }
  }

  // Re-expose smart versions of some the reader APIs

  /**
   * Access the database instance aka bindings
   *
   * @returns the DuckDB instance
   * @throws {Error} If the connection is closed
   */
  public get bindings(): AsyncDuckDBConnection['bindings'] {
    if (!this._conn) {
      throw new Error('Connection is closed');
    }
    return this._conn.bindings;
  }

  /**
   * Gracefully "close" connection. If `closed` this is a no-op.
   */
  public async close() {
    // If we are closed, just return
    if (this._conn === null) {
      return;
    }

    // If we have an active streaming reader - cancel it first
    if (this._reader) {
      // This call will nullify the reader via callback that we pass at creation time
      await this._reader.cancel();
    }

    // Cancel any pending queries. This should not be needed if we correctly
    // cancel all readers, but just in case.
    await this._conn.cancelSent();

    // Cancel prepared statement if any
    if (this._preparedStatement) {
      // This call will nullify the prepared statement via callback that we pass at creation time
      await this._preparedStatement.close();
    }

    // Call the onClose callback
    await this._onClose();

    // Mark as closed by setting the connection to null
    this._conn = null;
  }

  /**
   * Query the database using a pooled connection.
   *
   * NOTE: we manually recreate the type of signature here, due to TS constraints
   * on passing generic type vars to return types acquired via subscript
   *
   * @param text The SQL query to execute.
   * @returns A promise that resolves to the result of the query.
   * @throws {Error} If the connection is closed.
   * @throws {Error} If a streaming reader is active or there is a prepared statement (even if idle)
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public query<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(text: string): Promise<arrow.Table<T>> {
    // Check preconditions
    this._checkActionPreconditions();

    return this._conn!.query<T>(text);
  }

  /**
   * Starts a streaming query using this pooled connection.
   *
   * @param text The SQL query to execute.
   * @param allowStreamResult If `true`, the query results will be sent in streaming mode.
   * @returns A promise that resolves to a `AsyncDuckDBPooledStreamReader` instance.
   * @throws {Error} If the connection is closed.
   * @throws {Error} If a streaming reader is active or there is a prepared statement (even if idle)
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async send<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(text: string, allowStreamResult?: boolean): Promise<AsyncDuckDBPooledStreamReader<T>> {
    // Check preconditions
    this._checkActionPreconditions();

    // Send the query. Always in streaming mode
    const reader = await this._conn!.send<T>(text, allowStreamResult);

    // Return a pooled reader
    return new AsyncDuckDBPooledStreamReader<T>({
      reader,
      onClose: async () => {
        // cancelPending in the connection in case reader haven't reached the end.
        // Note that DuckDB will return `false` if the query is already done, but
        // we do not check the result.
        await this._conn?.cancelSent();

        // Nullify the reader
        this._reader = null;
      },
    });
  }

  /**
   * Creates a prepared statement from a query string using this pooled connection.
   *
   * @param text The SQL query to execute.
   * @returns A promise that resolves to a `AsyncDuckDBPooledPreparedStatement` instance.
   * @throws {Error} If the connection is closed.
   * @throws {Error} If a streaming reader is active or there is another prepared statement (even if idle)
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async prepare<
    T extends {
      [key: string]: arrow.DataType;
    } = any,
  >(text: string): Promise<AsyncDuckDBPooledPreparedStatement<T>> {
    // Check preconditions
    this._checkActionPreconditions();

    // Send the query. Always in streaming mode
    const stmt = await this._conn!.prepare<T>(text);

    // Return a pooled reader
    return new AsyncDuckDBPooledPreparedStatement<T>({
      conn: this,
      stmt,
      onClose: async () => {
        // Nullify the prepared statement
        this._preparedStatement = null;
      },
    });
  }

  /**
   * Cancel a query that was sent earlier
   *
   * @returns true if there were any queries to cancel, false otherwise.
   * @throws {Error} If the connection is closed.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public cancelSent(
    ...params: Parameters<AsyncDuckDBConnection['cancelSent']>
  ): ReturnType<AsyncDuckDBConnection['cancelSent']> {
    // Check if the connection is closed
    if (!this._conn) {
      throw new Error('Connection is closed');
    }

    return this._conn.cancelSent(...params);
  }

  /**
   * Get the unaliased names of all source table used in the query.
   *
   * @param query The SQL query to analyze.
   * @returns array of table names.
   * @throws {Error} If the connection is closed.
   * @throws {Error} If a streaming reader is active or there is a prepared statement (even if idle)
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public getTableNames(
    ...params: Parameters<AsyncDuckDBConnection['getTableNames']>
  ): ReturnType<AsyncDuckDBConnection['getTableNames']> {
    // Check preconditions
    this._checkActionPreconditions();

    return this._conn!.getTableNames(...params);
  }
}
