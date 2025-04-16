import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type * as arrow from 'apache-arrow';
import type { AsyncDuckDBConnectionPool } from './duckdb-connection-pool';

type IteratorResult<T extends arrow.TypeMap = any> =
  | { done: false; value: arrow.RecordBatch<T> }
  | { done: true; value: null };

export class AsyncDuckDBPooledStreamReader<T extends { [key: string]: arrow.DataType }> {
  /** The id of the connection in the pool */
  private readonly _id: number;
  /** The underlying arrow stream reader */
  private readonly _reader: arrow.AsyncRecordBatchStreamReader<T>;
  /** The underlying DuckDB connection */
  private _conn: AsyncDuckDBConnection | null;
  /** The owning pool */
  private readonly _pool: AsyncDuckDBConnectionPool;

  constructor(
    id: number,
    reader: arrow.AsyncRecordBatchStreamReader<T>,
    conn: AsyncDuckDBConnection,
    pool: AsyncDuckDBConnectionPool,
  ) {
    this._id = id;
    this._reader = reader;
    this._conn = conn;
    this._pool = pool;
  }

  /**
   * If `true`, the reader is closed and can't be used anymore.
   *
   * This doesn't mean it reached the end of the stream, as it
   * can be closed before.
   */
  public get closed(): boolean {
    return this._conn === null;
  }

  /**
   * Gracefully close reader. If `closed` this is a no-op.
   */
  public async close() {
    // If we are closed, just return
    if (this._conn === null) {
      return;
    }

    // Cancel the arrow stream reader.
    // AFAIK this does nothing as of time writing, but better safe than sorry
    await this._reader.cancel();

    // Also cancelPending in the connection in case we haven't reached the end.
    // Note that DuckDB will return `false` if the query is already done, but
    // we do not check the result.
    await this._conn.cancelSent();

    // Release the connection back to the pool
    this._pool.releaseConnection(this._id);

    // Mark as closed by setting the connection to null
    this._conn = null;
  }

  // Re-expose some of the connection methods we want to expose

  /** Access the database instance aka bindings */
  public get bindings(): AsyncDuckDBConnection['bindings'] {
    return this._pool.bindings;
  }

  /**
   * Cancel the reader. This is an alias for `close()`.
   */
  public async cancel() {
    await this.close();
  }

  /**
   * Create a streaming Send a query
   */
  public async next(): Promise<IteratorResult<T>> {
    if (this.closed) {
      return { done: true, value: null };
    }

    const { done, value } = await this._reader.next();

    if (done || !value) {
      // If we are done, close the reader
      this.close();

      return { done: true, value: null };
    }

    return { done: false, value };
  }
}
