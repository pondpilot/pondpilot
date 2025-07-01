import { TabId } from '@models/tab';
import { CLEANUP_OPERATION_TIMEOUT_MS, withTimeout } from '@utils/duckdb-file-operations';

interface TabCleanup {
  cancel: () => void;
  cleanup: () => Promise<void>;
}

/**
 * Global registry for active data adapter cleanup functions.
 * This allows us to cancel all active queries and wait for cleanup before file deletion.
 *
 * ## Purpose
 *
 * The DataAdapterRegistry serves as a centralized coordination point for managing
 * asynchronous data operations across multiple tabs. It implements the Observer/Registry
 * pattern to decouple high-level operations (like deleting data sources) from low-level
 * components (like individual data adapters).
 *
 * ## Architecture
 *
 * This is a singleton pattern that maintains a map of tab IDs to their cleanup functions.
 * Each data adapter registers its cancellation and cleanup functions when mounted, and
 * unregisters them when unmounted. This ensures that:
 *
 * 1. We can cleanly cancel all running queries before file operations
 * 2. We can wait for all async operations to complete before proceeding
 * 3. We avoid race conditions when deleting files that may still be in use
 *
 * ## Usage
 *
 * - Data adapters register themselves on mount using `register()`
 * - Data adapters unregister themselves on unmount using `unregister()`
 * - File deletion operations call `cancelTabsAndWaitForCleanup()` before attempting
 *   to delete files, ensuring all connections are properly released
 *
 * ## Error Handling
 *
 * The registry uses defensive error handling - if a cleanup operation fails or times out,
 * it logs a warning but continues with other cleanups. This ensures that one failed
 * cleanup doesn't prevent other tabs from being cleaned up properly.
 */
class DataAdapterRegistry {
  private cleanups = new Map<TabId, TabCleanup>();

  /**
   * Register cleanup functions for a tab
   */
  register(tabId: TabId, cancel: () => void, cleanup: () => Promise<void>) {
    this.cleanups.set(tabId, { cancel, cleanup });
  }

  /**
   * Unregister cleanup functions for a tab
   */
  unregister(tabId: TabId) {
    this.cleanups.delete(tabId);
  }

  /**
   * Cancel all operations for specific tabs and wait for cleanup
   */
  async cancelTabsAndWaitForCleanup(tabIds: TabId[]): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    for (const tabId of tabIds) {
      const tabCleanup = this.cleanups.get(tabId);
      if (tabCleanup) {
        // First cancel all operations
        tabCleanup.cancel();
        // Then wait for cleanup with timeout protection
        cleanupPromises.push(
          withTimeout(
            tabCleanup.cleanup(),
            CLEANUP_OPERATION_TIMEOUT_MS,
            `Cleanup for tab ${tabId}`,
          ).catch((error) => {
            console.warn(`Cleanup for tab ${tabId} failed or timed out:`, error);
            // Don't throw - we want to continue with other cleanups
          }),
        );
      }
    }

    // Wait for all cleanups to complete (or timeout)
    await Promise.all(cleanupPromises);
  }

  /**
   * Cancel all registered operations
   */
  cancelAll() {
    for (const cleanup of this.cleanups.values()) {
      cleanup.cancel();
    }
  }

  /**
   * Get the number of registered tabs
   */
  get size() {
    return this.cleanups.size;
  }
}

// Global singleton instance
export const dataAdapterRegistry = new DataAdapterRegistry();
