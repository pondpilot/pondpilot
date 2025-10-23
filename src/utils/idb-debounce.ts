import { AppIdbSchema } from '@models/persisted-store';
import { IDBPDatabase } from 'idb';

type IDBConnWrapper = IDBPDatabase<AppIdbSchema>;

/**
 * Debounced IndexedDB write manager
 * Batches writes to reduce IndexedDB operations for frequently updated fields like lastUsed
 */
class DebouncedIDBWriter {
  private pendingWrites = new Map<string, { table: string; key: string; value: unknown }>();
  private flushTimer: number | undefined;
  private readonly debounceMs: number;

  constructor(debounceMs: number = 500) {
    this.debounceMs = debounceMs;
  }

  /**
   * Schedule a write to IndexedDB, debounced to avoid excessive writes
   */
  schedulePut(table: string, value: unknown, key: string, iDb: IDBConnWrapper): void {
    const writeKey = `${table}:${key}`;
    this.pendingWrites.set(writeKey, { table, key, value });

    // Clear existing timer if any
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }

    // Schedule flush
    this.flushTimer = window.setTimeout(() => {
      this.flush(iDb);
    }, this.debounceMs);
  }

  /**
   * Immediately flush all pending writes
   */
  flush(iDb: IDBConnWrapper): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const writes = Array.from(this.pendingWrites.values());
    this.pendingWrites.clear();

    for (const { table, key, value } of writes) {
      (iDb.put as any)(table, value, key).catch((error: any) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Failed to persist ${table} update:`, error);
        }
      });
    }
  }

  /**
   * Cancel all pending writes
   */
  cancel(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.pendingWrites.clear();
  }
}

// Singleton instance for lastUsed updates
export const lastUsedWriter = new DebouncedIDBWriter(500);

// Flush on page unload to ensure pending writes are persisted
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { _iDbConn } = (window as any).useAppStore?.getState?.() ?? {};
    if (_iDbConn) {
      lastUsedWriter.flush(_iDbConn);
    }
  });
}
