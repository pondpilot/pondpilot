import type * as arrow from 'apache-arrow';

type IteratorResult<T extends arrow.TypeMap = any> =
  | { done: false; value: arrow.RecordBatch<T> }
  | { done: true; value: null };

/**
 * A wrapper around the Arrow async batch streaming reader produced by our pool
 * implementation. It has two enhancements over the original:
 * 1. Provides a slightly better typed and more stable `next()` API. As soon as
 *    there are no batches or batch is empty, it will return `done: true`
 *    (no spurious empty batch at the ed)
 * 2. It self-manages. When it is exhausted or canceled - it will release the
 *    underlying connection back to the pool.
 */
export class AsyncDuckDBPooledStreamReader<T extends { [key: string]: arrow.DataType }> {
  /** The underlying arrow stream reader */
  private _reader: arrow.AsyncRecordBatchStreamReader<T> | null;
  /** A callabck that this reader will call when exhausted/closed/cancelled */
  private _onClose: () => Promise<void>;

  constructor({
    reader,
    onClose,
  }: {
    reader: arrow.AsyncRecordBatchStreamReader<T>;
    onClose: () => Promise<void>;
  }) {
    this._reader = reader;
    this._onClose = onClose;
  }

  /**
   * If `true`, the reader is closed and can't be used anymore.
   *
   * This doesn't mean it reached the end of the stream, as it
   * can be canceled at any time.
   */
  public get closed(): boolean {
    return this._reader === null;
  }

  /**
   * Gracefully close reader. If `closed` this is a no-op.
   */
  public async close() {
    // If we are closed, just return
    if (this._reader === null) {
      return;
    }

    // Cancel the arrow stream reader.
    // AFAIK this does nothing as of time writing, but better safe than sorry
    await this._reader.cancel();

    // Call the onClose callback
    await this._onClose();

    // Mark as closed by setting the reader to null
    this._reader = null;
  }

  // Re-expose smart versions of some the reader APIs

  /**
   * Cancel the reader. This is an alias for `close()`.
   */
  public async cancel() {
    await this.close();
  }

  /**
   * Iterate over the batches in the stream.
   *
   * If `closed`, this will continue to return `done: true`.
   */
  public async next(): Promise<IteratorResult<T>> {
    if (this._reader === null) {
      // If we are closed, just return
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
