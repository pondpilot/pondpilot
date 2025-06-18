import { test as base } from '@playwright/test';

type ClearStorageFixtures = {
  /**
   * Clears all browser storage including localStorage, sessionStorage, and IndexedDB
   */
  clearStorageState: () => Promise<void>;
};

export const test = base.extend<ClearStorageFixtures>({
  clearStorageState: async ({ page }, use) => {
    await use(async () => {
      // Clear all storage types
      await page.evaluate(() => {
        // Clear localStorage
        window.localStorage.clear();

        // Clear sessionStorage
        window.sessionStorage.clear();

        // Clear IndexedDB databases
        return new Promise<void>((resolve) => {
          if (!window.indexedDB) {
            resolve();
            return;
          }

          // Get all databases
          indexedDB
            .databases()
            .then((databases) => {
              const deletePromises = databases.map((db) => {
                if (db.name) {
                  return new Promise<void>((deleteResolve) => {
                    const deleteReq = indexedDB.deleteDatabase(db.name!);
                    deleteReq.onsuccess = () => deleteResolve();
                    deleteReq.onerror = () => deleteResolve(); // Continue even if error
                  });
                }
                return Promise.resolve();
              });

              Promise.all(deletePromises).then(() => resolve());
            })
            .catch(() => {
              // If databases() is not supported, just resolve
              resolve();
            });
        });
      });

      // Also clear OPFS if available
      await page.evaluate(async () => {
        try {
          const root = await navigator.storage.getDirectory();
          // Get all entries and remove them
          for await (const entry of root.values()) {
            await root.removeEntry(entry.name, { recursive: true });
          }
        } catch {
          // OPFS might not be available or supported
        }
      });
    });
  },
});
