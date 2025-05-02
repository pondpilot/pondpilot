import type { AsyncPreparedStatement } from '@duckdb/duckdb-wasm';
import type * as arrow from 'apache-arrow';

import type { AsyncDuckDBPooledConnection } from './duckdb-pooled-connection';
import { AsyncDuckDBPooledStreamReader } from './duckdb-pooled-streaming-reader';

/**
 * A wrapper around the DuckDB prepared statement produced by our pool/pooled connection.
 *
 * It re-exposes some of the DuckDB connection methods and self-manages in terms of
 * iteraction with the parent pooled connection. Note that closing a prepared statement
 * doesn't release the connection back to the pool. You have to explicitly call
 * `close()` on the pooled connection to do that.
 *
 * It also offers one big advantage over the DuckDB connection API:
 * it will NOT allow runnig a `query` and other APIs while a `send` is in progress.
 *
 * NOTE: most methods whose API is exactly the same as the DuckDB connection
 * will raise an error if the connection is closed!
 */
export class AsyncDuckDBPooledPreparedStatement<
  T extends {
    [key: string]: arrow.DataType;
  } = any,
> {
  /** The underlying DuckDB conection */
  private _conn: AsyncDuckDBPooledConnection;
  /** The underlying DuckDB prepared statemet */
  private _stmt: AsyncPreparedStatement | null;
  /** An arrow stream reader created via send */
  private _reader: AsyncDuckDBPooledStreamReader<any> | null;
  /** A callabck that this reader will call when exhausted/closed/cancelled */
  private _onClose: () => Promise<void>;

  constructor({
    conn,
    stmt,
    onClose,
  }: {
    conn: AsyncDuckDBPooledConnection;
    stmt: AsyncPreparedStatement;
    onClose: () => Promise<void>;
  }) {
    this._conn = conn;
    this._stmt = stmt;
    this._onClose = onClose;
    this._reader = null;
  }

  /**
   * If `true`, the statment is "closed", meaning it can't be used anymore.
   *
   * Closed doesn't mean the underlying connection is closed.
   */
  public get closed(): boolean {
    return this._stmt === null;
  }

  _checkActionPreconditions(): void {
    if (!this._stmt) {
      throw new Error('Prepared statement is closed');
    }

    if (this._reader) {
      throw new Error('Cannot run a query while a streaming reader is active');
    }
  }

  // Re-expose smart versions of some the reader APIs

  /**
   * Gracefully "close" statement. If `closed` this is a no-op.
   */
  public async close() {
    // If we are closed, just return
    if (this._stmt === null) {
      return;
    }

    // If we have an active streaming reader - cancel it first
    if (this._reader) {
      // This call will nullify the reader via callback that we pass at creation time
      await this._reader.cancel();
    }

    // Close the uderlyig statement
    await this._stmt.close();

    // Call the onClose callback
    await this._onClose();

    // Mark as closed by setting the connection to null
    this._stmt = null;
  }

  /**
   * Query the database using a prepared statement.
   *
   * @param params The parameters to bind to the prepared statement.
   * @returns A promise that resolves to the result of the query.
   * @throws {Error} If the statemet is closed.
   * @throws {Error} If a streaming reader is active.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public query(params: Parameters<AsyncPreparedStatement['query']>): Promise<arrow.Table<T>> {
    // Check preconditions
    this._checkActionPreconditions();

    return this._stmt!.query(...params);
  }

  /**
   * Starts a streaming query using this prepared statement.
   *
   * @param
   * @returns A promise that resolves to a `AsyncDuckDBPooledStreamReader` instance.
   * @throws {Error} If the prepared statement is closed.
   * @throws {Error} If another streaming reader is active.
   * @throws {Error} Any underlying error from the DuckDB connection.
   */
  public async send(
    params: Parameters<AsyncPreparedStatement['send']>,
  ): Promise<AsyncDuckDBPooledStreamReader<T>> {
    // Check preconditions
    this._checkActionPreconditions();

    // Send the query. Always in streaming mode
    const reader = await this._stmt!.send(...params);

    // Return a pooled reader
    return new AsyncDuckDBPooledStreamReader<T>({
      reader,
      onClose: async () => {
        // cancelPending in the connection in case reader haven't reached the end.
        // Note that DuckDB will return `false` if the query is already done, but
        // we do not check the result.
        await this._conn.cancelSent();

        // Nullify the reader
        this._reader = null;
      },
    });
  }
}
