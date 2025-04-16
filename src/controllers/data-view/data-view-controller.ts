// Public data view controller API's
// By convetion the order should follow CRUD groups!

import { DATA_VIEW_CACHE_TABLE_NAME } from '@models/persisted-store';
import { useAppStore } from '@store/app-store';
import { DataViewCacheItem, DataViewCacheKey } from '@models/data-view';
import { persistRemovedDataViewCacheEntires } from './persist';

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
 * Updates (or created) the data view cache with a new value.
 *
 * @param entry - A single entry to update in the cache
 */
export const setOrUpdateDataViewCache = (entry: DataViewCacheItem): void => {
  const { dataViewCache, _iDbConn: iDbConn } = useAppStore.getState();

  // Create a new Map with all existing entries plus new/updated one
  const newDataViewCache = new Map(dataViewCache);
  newDataViewCache.set(entry.key, entry);

  // Update the store
  useAppStore.setState(
    { dataViewCache: newDataViewCache },
    undefined,
    'AppStore/updateDataViewCache',
  );

  // If we have an IndexedDB connection, persist the cache update
  if (iDbConn) {
    iDbConn.put(DATA_VIEW_CACHE_TABLE_NAME, entry, entry.key);
  }
};

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

/**
 * Removes entries from the data view cache.
 *
 * @param keysToRemove - An array of keys to remove from the cache
 */
export const removeDataViewCacheEntries = (keysToRemove: DataViewCacheKey[]): void => {
  const { dataViewCache, _iDbConn: iDbConn } = useAppStore.getState();

  // Handle both single key and array of keys
  const keysSet = new Set(keysToRemove);

  // Skip if there's nothing to remove
  if (keysSet.size === 0) return;

  // Create a new Map excluding the keys to be removed
  const newDataViewCache = new Map(Array.from(dataViewCache).filter(([key]) => !keysSet.has(key)));

  // Update the store
  useAppStore.setState(
    { dataViewCache: newDataViewCache },
    undefined,
    'AppStore/removeDataViewCacheEntries',
  );

  // If we have an IndexedDB connection, persist the deletion
  if (iDbConn) {
    persistRemovedDataViewCacheEntires(iDbConn, keysSet);
  }
};
