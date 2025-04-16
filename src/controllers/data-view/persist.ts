// Async functions to persist data view data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { IDBPDatabase } from 'idb';

import { AppIdbSchema, DATA_VIEW_CACHE_TABLE_NAME } from '@models/persisted-store';
import { DataViewCacheKey } from '@models/data-view';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

export async function persistRemovedDataViewCacheEntires(
  iDb: IDBPDatabase<AppIdbSchema>,
  keysToRemoveSet: Set<DataViewCacheKey>,
) {
  const tx = iDb.transaction(DATA_VIEW_CACHE_TABLE_NAME, 'readwrite');
  const dataViewCacheStore = tx.objectStore(DATA_VIEW_CACHE_TABLE_NAME);

  // Delete each entry from IndexedDB
  for (const key of keysToRemoveSet) {
    await dataViewCacheStore.delete(key);
  }

  await tx.done;
}
