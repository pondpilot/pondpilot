import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { tableFromIPC, Table } from 'apache-arrow';

// Discriminated union for type-safe stream events
export type BinaryStreamEvent =
  | {
      message_type: 'schema';
      stream_id: string;
      data: Uint8Array; // Arrow IPC schema data
    }
  | {
      message_type: 'batch';
      stream_id: string;
      data: Uint8Array; // Arrow IPC batch data
      batch_index?: number;
    }
  | {
      message_type: 'complete';
      stream_id: string;
      data: Uint8Array; // Total batch count as bytes
    }
  | {
      message_type: 'error';
      stream_id: string;
      data: Uint8Array; // Error message as UTF-8 bytes
    };

// Type guards for runtime type checking
export function isBatchEvent(
  event: BinaryStreamEvent,
): event is Extract<BinaryStreamEvent, { message_type: 'batch' }> {
  return event.message_type === 'batch';
}

export function isSchemaEvent(
  event: BinaryStreamEvent,
): event is Extract<BinaryStreamEvent, { message_type: 'schema' }> {
  return event.message_type === 'schema';
}

export function isCompleteEvent(
  event: BinaryStreamEvent,
): event is Extract<BinaryStreamEvent, { message_type: 'complete' }> {
  return event.message_type === 'complete';
}

export function isErrorEvent(
  event: BinaryStreamEvent,
): event is Extract<BinaryStreamEvent, { message_type: 'error' }> {
  return event.message_type === 'error';
}

/**
 * Arrow reader for Tauri that uses binary IPC for optimal performance.
 * This reader receives raw binary Arrow IPC data from the Rust backend
 * and reconstructs Apache Arrow tables without any Base64 encoding overhead.
 */
export class TauriArrowReader {
  private streamId: string;
  private unlisteners: UnlistenFn[] = [];
  private schemaBuffer: Uint8Array | null = null;
  private batches: Uint8Array[] = [];
  private isComplete = false;
  private error: Error | null = null;
  private initResolver: (() => void) | null = null;
  private initPromise: Promise<void>;
  private cancelRequested = false;
  private onBatchCallback?: (batch: any) => void;
  private onCompleteCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;

  // For async iterator implementation
  private batchQueue: { value: any; acked: boolean; batchId: number }[] = [];
  private batchResolver: ((value: IteratorResult<any>) => void) | null = null;
  private isClosed = false;
  private iteratorMode = false;
  private prefetchAcknowledged = 0; // number of batches acked before consumption
  private static readonly PREFETCH_WINDOW = 3; // small prefetch window
  private ackAllOnArrival = false; // when true, acknowledge every batch on arrival (used by getTable)
  private batchCounter = 0; // Track batch IDs to prevent double-acknowledgment
  private acknowledgedBatches = new Set<number>(); // Track which batches have been acknowledged

  constructor(streamId: string) {
    this.streamId = streamId;

    // Create init promise that resolves when listeners are ready
    this.initPromise = new Promise((resolve) => {
      this.initResolver = resolve;
    });

    // Set up listeners immediately
    this.setupListeners();
  }

  private async setupListeners() {
    try {
      // Listen for the unified binary stream event
      const unlisten = await listen<BinaryStreamEvent>(
        `stream-binary-${this.streamId}`,
        (event) => {
          this.handleBinaryEvent(event.payload);
        },
      );

      this.unlisteners.push(unlisten);

      // Resolve init promise
      if (this.initResolver) {
        this.initResolver();
        this.initResolver = null;
      }
    } catch (error) {
      console.error('[TauriArrowReader] Failed to set up listeners:', error);
      this.error = error as Error;
      if (this.onErrorCallback) {
        this.onErrorCallback(this.error);
      }
    }
  }

  private handleBinaryEvent(event: BinaryStreamEvent) {
    // Convert the data to Uint8Array if it's not already
    const data = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);

    switch (event.message_type) {
      case 'schema':
        // Received schema
        this.schemaBuffer = data;
        break;

      case 'batch':
        // Received batch
        this.batches.push(data);

        // Process the batch if we have the schema
        if (this.schemaBuffer) {
          try {
            // Combine schema and batch for IPC reconstruction
            const ipcBuffer = this.combineSchemaAndBatch(this.schemaBuffer, data);
            const table = tableFromIPC(ipcBuffer);

            // Assign unique ID to this batch
            const batchId = this.batchCounter;
            this.batchCounter += 1;

            // Queue for async iterator with ack metadata
            let ackedNow = false;
            if (this.ackAllOnArrival) {
              // Unbounded prefetch mode (e.g., full-table operations)
              if (!this.acknowledgedBatches.has(batchId)) {
                invoke('acknowledge_stream_batch', {
                  streamId: this.streamId,
                  batchIndex: batchId,
                }).catch((err) => {
                  console.warn('[TauriArrowReader] Failed to acknowledge batch:', err);
                });
                this.acknowledgedBatches.add(batchId);
                ackedNow = true;
              }
            } else if (
              !this.iteratorMode &&
              this.prefetchAcknowledged < TauriArrowReader.PREFETCH_WINDOW
            ) {
              // Acknowledge on arrival up to the prefetch window
              if (!this.acknowledgedBatches.has(batchId)) {
                invoke('acknowledge_stream_batch', {
                  streamId: this.streamId,
                  batchIndex: batchId,
                }).catch((err) => {
                  console.warn('[TauriArrowReader] Failed to acknowledge batch:', err);
                });
                this.acknowledgedBatches.add(batchId);
                this.prefetchAcknowledged += 1;
                ackedNow = true;
              }
            }
            this.batchQueue.push({ value: table, acked: ackedNow, batchId });

            // Note: additional unconditional acknowledgments removed to avoid double-ACK.

            // Resolve any waiting next() call
            if (this.batchResolver) {
              const nextItem = this.batchQueue.shift();
              if (nextItem) {
                // If not previously acknowledged, acknowledge on consumption
                if (!nextItem.acked && !this.acknowledgedBatches.has(nextItem.batchId)) {
                  invoke('acknowledge_stream_batch', {
                    streamId: this.streamId,
                    batchIndex: nextItem.batchId,
                  }).catch((err) => {
                    console.warn('[TauriArrowReader] Failed to acknowledge consumed batch:', err);
                  });
                  this.acknowledgedBatches.add(nextItem.batchId);
                } else if (nextItem.acked) {
                  // This batch was part of prefetch; reduce the counter on consumption
                  this.prefetchAcknowledged = Math.max(0, this.prefetchAcknowledged - 1);
                }
                this.batchResolver({ value: nextItem.value, done: false });
                this.batchResolver = null;
              }
            }

            // Call callback if provided
            if (this.onBatchCallback) {
              this.onBatchCallback(table);
            }
          } catch (error) {
            console.error('[TauriArrowReader] Failed to process batch:', error);
            this.error = error as Error;
            this.isClosed = true;

            // Resolve any waiting next() call with error
            if (this.batchResolver) {
              this.batchResolver({ value: undefined, done: true });
              this.batchResolver = null;
            }

            if (this.onErrorCallback) {
              this.onErrorCallback(this.error);
            }
          }
        }
        break;

      case 'complete': {
        // Extract batch count from the data (little-endian)
        const _batchCount =
          data.length >= 4
            ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true)
            : this.batches.length;

        // Stream complete
        this.isComplete = true;

        // Resolve any waiting next() call only if queue is empty
        if (this.batchResolver && this.batchQueue.length === 0) {
          this.batchResolver({ value: undefined, done: true });
          this.batchResolver = null;
        }

        if (this.onCompleteCallback) {
          this.onCompleteCallback();
        }
        // Safe to clean up listeners; no more events will arrive
        this.cleanup();
        break;
      }

      case 'error': {
        const errorMessage = new TextDecoder().decode(data);
        // Stream error occurred
        this.error = new Error(errorMessage);
        this.isClosed = true;

        // Resolve any waiting next() call
        if (this.batchResolver) {
          this.batchResolver({ value: undefined, done: true });
          this.batchResolver = null;
        }

        if (this.onErrorCallback) {
          this.onErrorCallback(this.error);
        }
        this.cleanup();
        break;
      }
    }
  }

  /**
   * Combines schema and batch buffers into a complete Arrow IPC stream buffer
   */
  private combineSchemaAndBatch(schema: Uint8Array, batch: Uint8Array): Uint8Array {
    // The Rust backend sends each batch as a complete Arrow IPC stream
    // (with its own schema embedded), so we can directly use the batch buffer
    // The separate schema message is sent for client-side validation/processing
    // but the batch already contains all necessary metadata for reconstruction
    return batch;
  }

  /**
   * Wait for listeners to be initialized
   */
  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Set callback for when batches arrive
   */
  onBatch(callback: (batch: any) => void) {
    this.onBatchCallback = callback;
  }

  /**
   * Set callback for completion
   */
  onComplete(callback: () => void) {
    this.onCompleteCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void) {
    this.onErrorCallback = callback;
  }

  /**
   * Get all accumulated batches as a single Arrow table
   */
  async getTable(): Promise<any> {
    // Switch to unbounded prefetch to allow backend to stream to completion
    this.ackAllOnArrival = true;
    // Acknowledge any queued, unacknowledged batches immediately
    for (const [_index, item] of this.batchQueue.entries()) {
      if (!item.acked && !this.acknowledgedBatches.has(item.batchId)) {
        invoke('acknowledge_stream_batch', {
          streamId: this.streamId,
          batchIndex: item.batchId,
        }).catch((err) => {
          console.warn('[TauriArrowReader] Failed to acknowledge queued batch:', err);
        });
        this.acknowledgedBatches.add(item.batchId);
        item.acked = true;
      }
    }

    if (!this.isComplete && !this.error) {
      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        this.onCompleteCallback = resolve;
        this.onErrorCallback = reject;
      });
    }

    if (this.error) {
      throw this.error;
    }

    if (!this.schemaBuffer || this.batches.length === 0) {
      return null;
    }

    try {
      // Combine all batches into a single table by concatenating tables
      let combined: Table | null = null;
      for (const batch of this.batches) {
        const ipcBuffer = this.combineSchemaAndBatch(this.schemaBuffer, batch);
        const table = tableFromIPC(ipcBuffer);
        combined = combined ? (combined as any).concat(table) : table;
      }

      return combined;
    } catch (error) {
      console.error('[TauriArrowReader] Failed to construct table:', error);
      throw error;
    }
  }

  /**
   * Cancel the stream
   */
  async cancel(): Promise<void> {
    this.cancelRequested = true;
    this.isClosed = true;

    // Resolve any waiting next() call
    if (this.batchResolver) {
      this.batchResolver({ value: undefined, done: true });
      this.batchResolver = null;
    }

    // Tell the backend to cancel the stream
    await invoke('cancel_stream', { streamId: this.streamId }).catch((error) => {
      console.warn('[TauriArrowReader] Failed to cancel stream on backend:', error);
    });

    this.cleanup();
  }

  /**
   * Clean up listeners
   */
  private cleanup() {
    // Unregister all event listeners
    for (const unlisten of this.unlisteners) {
      try {
        unlisten();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.unlisteners = [];
  }

  /**
   * Check if the stream is complete
   */
  get done(): boolean {
    return this.isComplete || this.error !== null || this.cancelRequested;
  }

  /**
   * Get the stream ID
   */
  get id(): string {
    return this.streamId;
  }

  /**
   * Check if the stream is closed (for compatibility)
   */
  get closed(): boolean {
    return this.isClosed;
  }

  /**
   * Async iterator next() method for compatibility with streaming interface
   */
  async next(): Promise<IteratorResult<any>> {
    // Enter iterator mode: acknowledge on consumption rather than arrival
    this.iteratorMode = true;
    // If we have batches queued, return the next one
    if (this.batchQueue.length > 0) {
      const item = this.batchQueue.shift()!;
      if (!item.acked && !this.acknowledgedBatches.has(item.batchId)) {
        // Acknowledge batch consumption to open a slot in the backend window
        invoke('acknowledge_stream_batch', {
          streamId: this.streamId,
          batchIndex: item.batchId,
        }).catch((err) => {
          console.warn('[TauriArrowReader] Failed to acknowledge consumed batch:', err);
        });
        this.acknowledgedBatches.add(item.batchId);
      } else if (item.acked) {
        // This batch was part of prefetch; reduce the counter on consumption
        this.prefetchAcknowledged = Math.max(0, this.prefetchAcknowledged - 1);
      }
      return { value: item.value, done: false };
    }

    // If stream is complete and queue is empty, or closed/errored, we're done
    if ((this.isComplete && this.batchQueue.length === 0) || this.isClosed || this.error) {
      if (this.error) {
        throw this.error;
      }
      return { value: undefined, done: true };
    }

    // Wait for the next batch to arrive
    return new Promise<IteratorResult<any>>((resolve) => {
      this.batchResolver = (result) => {
        resolve(result);
      };
    });
  }

  /**
   * Make the reader an async iterable
   */
  [Symbol.asyncIterator]() {
    return this;
  }

  /**
   * Return method for async iterator (called when iteration is stopped early)
   */
  async return(): Promise<IteratorResult<any>> {
    await this.cancel();
    return { value: undefined, done: true };
  }

  /**
   * Throw method for async iterator (called when an error occurs during iteration)
   */
  async throw(error: Error): Promise<IteratorResult<any>> {
    this.error = error;
    this.isClosed = true;
    this.cleanup();
    return { value: undefined, done: true };
  }
}
