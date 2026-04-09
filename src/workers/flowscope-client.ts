/**
 * FlowScope Worker Client
 *
 * Provides a typed interface to communicate with the FlowScope Web Worker.
 * Supports request cancellation via request IDs - when a new request is made,
 * pending requests for the same operation type are automatically cancelled.
 */

/* eslint-disable max-classes-per-file */

import type {
  AnalyzeResult,
  StatementSplitResult,
  CompletionItemsResult,
  SchemaMetadata,
  LintConfig,
} from '@pondpilot/flowscope-core';

import type { FlowScopeRequestType, FlowScopeResponse } from './flowscope-worker';

/**
 * Error thrown when a request is cancelled because a newer request of the same type was made.
 * Callers can check `error instanceof CancelledError` to distinguish from real errors.
 */
export class CancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CancelledError';
  }
}

type PendingRequest<T> = {
  id: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

type RequestKey = FlowScopeRequestType | 'interactiveAnalyze';

// Default timeout for worker requests (30 seconds)
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

class FlowScopeClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest<unknown>>();
  private latestRequestByKey = new Map<RequestKey, number>();

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.reject(error);
    }
    this.pendingRequests.clear();
    this.latestRequestByKey.clear();
  }

  private recycleWorker(error: Error): void {
    const activeWorker = this.worker;
    this.worker = null;

    if (activeWorker) {
      activeWorker.terminate();
    }

    this.rejectPendingRequests(error);
  }

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

        // Clear the timeout since we received a response
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
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
        this.recycleWorker(new Error('Worker error'));
      };

      this.worker.onmessageerror = (error) => {
        console.error('FlowScope worker message error:', error);
        this.recycleWorker(new Error('Worker message error'));
      };
    }

    return this.worker;
  }

  private sendRequest<T>(
    requestKey: RequestKey,
    request: Record<string, unknown>,
    cancelPrevious: boolean = false,
  ): Promise<T> {
    this.requestId += 1;
    const id = this.requestId;

    // Only cancel previous request if explicitly requested
    // (useful for autocomplete where only the latest result matters)
    if (cancelPrevious) {
      const previousId = this.latestRequestByKey.get(requestKey);
      if (previousId !== undefined) {
        const previous = this.pendingRequests.get(previousId);
        if (previous) {
          // Clear the timeout for the cancelled request
          if (previous.timeoutId) {
            clearTimeout(previous.timeoutId);
          }
          this.pendingRequests.delete(previousId);
          // Reject with CancelledError so callers can distinguish from real errors
          previous.reject(new CancelledError());
        }
      }
    }

    this.latestRequestByKey.set(requestKey, id);

    return new Promise((resolve, reject) => {
      // Set up timeout to prevent memory leaks if worker hangs
      const timeoutId = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.recycleWorker(
            new Error(`Worker request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms`),
          );
        }
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        id,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      const worker = this.getWorker();
      worker.postMessage({ ...request, id });
    });
  }

  /**
   * Check if a request ID is still the latest for its type.
   * Used to skip processing stale results.
   */
  isRequestCurrent(type: RequestKey, id: number): boolean {
    return this.latestRequestByKey.get(type) === id;
  }

  /**
   * Analyze SQL for diagnostics, table references, etc.
   */
  async analyze(
    sql: string,
    schema?: SchemaMetadata,
    dialect: string = 'duckdb',
    lint?: LintConfig,
    options?: {
      cancelPrevious?: boolean;
      requestKey?: RequestKey;
    },
  ): Promise<AnalyzeResult> {
    return this.sendRequest<AnalyzeResult>(
      options?.requestKey ?? 'analyze',
      {
        type: 'analyze',
        sql,
        dialect,
        schema,
        lint,
      },
      options?.cancelPrevious ?? false,
    );
  }

  /**
   * Split SQL into individual statements.
   * Cancels previous split requests since only the latest result matters.
   */
  async split(sql: string, dialect: string = 'duckdb'): Promise<StatementSplitResult> {
    return this.sendRequest<StatementSplitResult>(
      'split',
      {
        type: 'split',
        sql,
        dialect,
      },
      true, // Cancel previous split requests
    );
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

    this.rejectPendingRequests(new Error('Worker terminated'));
  }
}

// Singleton instance for background operations (split, analyze)
let clientInstance: FlowScopeClient | null = null;

// Separate singleton for interactive completion requests.
// Completions run on a dedicated worker so they are never blocked
// by long-running split/analyze operations on the main worker.
let completionClientInstance: FlowScopeClient | null = null;

// Separate singleton for interactive statement analysis requests (hover, etc.).
// These requests are bursty and should not clog the main analysis worker.
let interactiveClientInstance: FlowScopeClient | null = null;

export function getFlowScopeClient(): FlowScopeClient {
  if (!clientInstance) {
    clientInstance = new FlowScopeClient();
  }
  return clientInstance;
}

/**
 * Returns a FlowScopeClient dedicated to completion requests.
 * Uses a separate Web Worker so that completionItems() is never
 * blocked by split() or analyze() running on the main worker.
 */
export function getCompletionClient(): FlowScopeClient {
  if (!completionClientInstance) {
    completionClientInstance = new FlowScopeClient();
  }
  return completionClientInstance;
}

export function getInteractiveFlowScopeClient(): FlowScopeClient {
  if (!interactiveClientInstance) {
    interactiveClientInstance = new FlowScopeClient();
  }
  return interactiveClientInstance;
}

export function terminateFlowScopeClients(): void {
  if (clientInstance) {
    clientInstance.terminate();
    clientInstance = null;
  }
  if (completionClientInstance) {
    completionClientInstance.terminate();
    completionClientInstance = null;
  }
  if (interactiveClientInstance) {
    interactiveClientInstance.terminate();
    interactiveClientInstance = null;
  }
}

export type { FlowScopeClient };
