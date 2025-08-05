import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { tableFromIPC, RecordBatch, Schema } from 'apache-arrow';

import { getLogger } from './debug-logger';

const logger = getLogger('database:tauri-arrow-reader');

export class TauriArrowReader {
  private streamId: string;
  private schema: Schema | null = null;
  private batchQueue: RecordBatch[] = [];
  private listeners: UnlistenFn[] = [];
  private completed = false;
  private error: Error | null = null;
  private resolver: ((value: IteratorResult<RecordBatch>) => void) | null = null;
  private initialized = false;
  private initPromise: Promise<void>;

  constructor(streamId: string) {
    this.streamId = streamId;
    this.initPromise = this.setupListeners();
  }

  // Wait for initialization to complete
  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  private async setupListeners() {
    logger.debug(`Setting up listeners for stream ${this.streamId}`);
    try {
      // Schema listener
      this.listeners.push(
        await listen(`stream-${this.streamId}-schema`, (event) => {
          logger.trace(`Received schema event for stream ${this.streamId}`);
          try {
            const schemaBase64 = event.payload as string;
            logger.trace(`Schema base64 length: ${schemaBase64.length}`);
            const schemaBuffer = this.base64ToArrayBuffer(schemaBase64);

            // Deserialize schema from Arrow IPC format
            const table = tableFromIPC(schemaBuffer);
            this.schema = table.schema;
            this.initialized = true;
            logger.debug('Schema parsed successfully', { schema: this.schema });
          } catch (e) {
            logger.error('Failed to parse schema', e);
            this.error = new Error(`Failed to parse schema: ${e}`);
            if (this.resolver) {
              this.resolver({ done: true, value: undefined });
            }
          }
        }),
      );

      // Batch listener
      this.listeners.push(
        await listen(`stream-${this.streamId}-batch`, async (event) => {
          logger.debug(`[TauriArrowReader] Received batch event for stream ${this.streamId}`);
          try {
            const batchBase64 = event.payload as string;
            logger.debug(`[TauriArrowReader] Batch base64 length: ${batchBase64.length}`);
            const batchBuffer = this.base64ToArrayBuffer(batchBase64);

            // Deserialize batch from Arrow IPC format
            const table = tableFromIPC(batchBuffer);

            // Extract the batch from the table
            const batch = table.batches[0];
            logger.debug('[TauriArrowReader] Batch parsed successfully:', batch);

            if (this.resolver) {
              logger.debug('[TauriArrowReader] Resolving with batch');
              this.resolver({ value: batch, done: false });
              this.resolver = null;
            } else {
              logger.debug('[TauriArrowReader] Queueing batch');
              this.batchQueue.push(batch);
            }
          } catch (e) {
            logger.error('[TauriArrowReader] Failed to parse batch:', e);
            this.error = new Error(`Failed to parse batch: ${e}`);
            if (this.resolver) {
              this.resolver({ done: true, value: undefined });
            }
          }
        }),
      );

      // Completion listener
      this.listeners.push(
        await listen(`stream-${this.streamId}-complete`, (event) => {
          logger.debug(`[TauriArrowReader] Received complete event for stream ${this.streamId}`);
          this.completed = true;
          const batchCount = event.payload as number;
          logger.debug(
            `[TauriArrowReader] Stream ${this.streamId} completed with ${batchCount} batches`,
          );

          if (this.resolver && this.batchQueue.length === 0) {
            logger.debug('[TauriArrowReader] Resolving with done=true');
            this.resolver({ done: true, value: undefined });
          }
        }),
      );

      // Error listener
      this.listeners.push(
        await listen(`stream-${this.streamId}-error`, (event) => {
          this.error = new Error(event.payload as string);
          this.completed = true;

          if (this.resolver) {
            this.resolver({ done: true, value: undefined });
          }
        }),
      );
    } catch (e) {
      this.error = new Error(`Failed to setup listeners: ${e}`);
      this.completed = true;
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async next(): Promise<IteratorResult<RecordBatch>> {
    logger.debug(`[TauriArrowReader] next() called for stream ${this.streamId}`);

    // Wait for initialization
    await this.initPromise;
    logger.debug(`[TauriArrowReader] Initialization complete for stream ${this.streamId}`);

    if (this.error) {
      logger.error('[TauriArrowReader] Throwing error:', this.error);
      throw this.error;
    }

    // If we have queued batches, return them first
    if (this.batchQueue.length > 0) {
      const batch = this.batchQueue.shift()!;
      logger.debug(
        `[TauriArrowReader] Returning queued batch, ${this.batchQueue.length} remaining`,
      );
      return { value: batch, done: false };
    }

    // If completed and no more batches, we're done
    if (this.completed) {
      logger.debug('[TauriArrowReader] Stream completed, returning done=true');
      return { done: true, value: undefined };
    }

    // Wait for the next batch
    logger.debug('[TauriArrowReader] No batches available, waiting for next batch...');
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  async cancel() {
    // Mark as cancelled immediately to prevent further processing
    this.completed = true;
    this.error = new Error('Stream cancelled');

    // Resolve any pending promise immediately
    if (this.resolver) {
      this.resolver({ done: true, value: undefined });
      this.resolver = null;
    }

    // Clean up listeners immediately
    for (const unlisten of this.listeners) {
      unlisten();
    }
    this.listeners = [];

    // Clear batch queue to free memory
    this.batchQueue = [];

    // Cancel stream on backend (fire and forget for faster response)
    const { invoke } = await import('@tauri-apps/api/core');
    invoke('cancel_stream', { streamId: this.streamId }).catch((err) => {
      logger.error(`[TauriArrowReader] Failed to cancel stream ${this.streamId}:`, err);
    });
  }

  get closed() {
    // Only consider it closed if there was an error or cancellation
    // A naturally completed stream is not "closed" in the error sense
    return this.error !== null;
  }

  // Make it an async iterator
  [Symbol.asyncIterator]() {
    return this;
  }
}
