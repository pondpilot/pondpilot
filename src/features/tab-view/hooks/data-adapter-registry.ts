import { TabId } from '@models/tab';

interface TabCleanup {
  cancel: () => void;
  cleanup: () => Promise<void>;
}

/**
 * Global registry for active data adapter cleanup functions.
 * This allows us to cancel all active queries and wait for cleanup before file deletion.
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
        // Then wait for cleanup
        cleanupPromises.push(tabCleanup.cleanup());
      }
    }

    // Wait for all cleanups to complete
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
