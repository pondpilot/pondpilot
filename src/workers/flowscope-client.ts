/**
 * FlowScope Worker Client
 *
 * Provides a typed interface to communicate with the FlowScope Web Worker.
 * Supports request cancellation via request IDs - when a new request is made,
 * pending requests for the same operation type are automatically cancelled.
 */
import type {
  AnalyzeResult,
  StatementSplitResult,
  CompletionItemsResult,
  SchemaMetadata,
} from '@pondpilot/flowscope-core';

import type { FlowScopeRequestType, FlowScopeResponse } from './flowscope-worker';

type PendingRequest<T> = {
  id: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

class FlowScopeClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest<unknown>>();
  private latestRequestByType = new Map<FlowScopeRequestType, number>();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./flowscope-worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (event: MessageEvent<FlowScopeResponse<unknown>>) => {
        const response = event.data;
        const pending = this.pendingRequests.get(response.id);

        if (!pending) {
          // Request was cancelled or already handled
          return;
        }

        this.pendingRequests.delete(response.id);

        if (response.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error));
        }
      };

      this.worker.onerror = (error) => {
        console.error('FlowScope worker error:', error);
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error('Worker error'));
          this.pendingRequests.delete(id);
        }
      };
    }

    return this.worker;
  }

  private sendRequest<T>(
    type: FlowScopeRequestType,
    request: Record<string, unknown>,
    cancelPrevious: boolean = false,
  ): Promise<T> {
    this.requestId += 1;
    const id = this.requestId;

    // Only cancel previous request if explicitly requested
    // (useful for autocomplete where only the latest result matters)
    if (cancelPrevious) {
      const previousId = this.latestRequestByType.get(type);
      if (previousId !== undefined) {
        const previous = this.pendingRequests.get(previousId);
        if (previous) {
          // Resolve with a cancelled marker instead of rejecting
          // This prevents error spam in the console
          this.pendingRequests.delete(previousId);
        }
      }
    }

    this.latestRequestByType.set(type, id);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        id,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const worker = this.getWorker();
      worker.postMessage({ ...request, id });
    });
  }

  /**
   * Check if a request ID is still the latest for its type.
   * Used to skip processing stale results.
   */
  isRequestCurrent(type: FlowScopeRequestType, id: number): boolean {
    return this.latestRequestByType.get(type) === id;
  }

  /**
   * Analyze SQL for diagnostics, table references, etc.
   */
  async analyze(
    sql: string,
    schema?: SchemaMetadata,
    dialect: string = 'duckdb',
  ): Promise<AnalyzeResult> {
    return this.sendRequest<AnalyzeResult>('analyze', {
      type: 'analyze',
      sql,
      dialect,
      schema,
    });
  }

  /**
   * Split SQL into individual statements.
   */
  async split(sql: string, dialect: string = 'duckdb'): Promise<StatementSplitResult> {
    return this.sendRequest<StatementSplitResult>('split', {
      type: 'split',
      sql,
      dialect,
    });
  }

  /**
   * Get ranked completion items for autocomplete.
   * Cancels previous completion requests since only the latest matters.
   */
  async completionItems(
    sql: string,
    cursorOffset: number,
    schema?: SchemaMetadata,
    dialect: string = 'duckdb',
  ): Promise<CompletionItemsResult> {
    return this.sendRequest<CompletionItemsResult>(
      'completionItems',
      {
        type: 'completionItems',
        sql,
        dialect,
        cursorOffset,
        schema,
      },
      true, // Cancel previous completion requests
    );
  }

  /**
   * Terminate the worker. Call when the editor is unmounted.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.latestRequestByType.clear();
  }
}

// Singleton instance for the application
let clientInstance: FlowScopeClient | null = null;

export function getFlowScopeClient(): FlowScopeClient {
  if (!clientInstance) {
    clientInstance = new FlowScopeClient();
  }
  return clientInstance;
}

export function terminateFlowScopeClient(): void {
  if (clientInstance) {
    clientInstance.terminate();
    clientInstance = null;
  }
}

export type { FlowScopeClient };
