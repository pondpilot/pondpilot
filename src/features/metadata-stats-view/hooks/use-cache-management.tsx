import { useCallback } from 'react';

import { useMetadataCache } from '../utils/metadata-cache';

/**
 * Hook for managing metadata cache clearing in response to application state changes
 *
 * This hook provides utilities to clear cached metadata when data sources change,
 * tabs are deleted, or other state transitions occur that invalidate cached metadata.
 */
export function useCacheManagement() {
  const cache = useMetadataCache();

  /**
   * Clears cache entries when tabs are deleted
   */
  const clearCacheForDeletedTabs = useCallback(
    (tabIds: string[]) => {
      tabIds.forEach((tabId) => {
        const dataSourceId = `tab-${tabId}`;
        cache.clearDataSource(dataSourceId);
      });
    },
    [cache],
  );

  /**
   * Clears cache entries when data sources are deleted
   */
  const clearCacheForDeletedDataSources = useCallback(
    (dataSourceIds: string[]) => {
      dataSourceIds.forEach((dataSourceId) => {
        cache.clearDataSource(dataSourceId);
      });
    },
    [cache],
  );

  /**
   * Clears all tab-based cache entries (useful for bulk operations)
   */
  const clearAllTabCache = useCallback(() => {
    cache.clearTabDataSources();
  }, [cache]);

  /**
   * Clears specific cache entry by data source and version
   */
  const clearSpecificCache = useCallback(
    (dataSourceId: string, dataSourceVersion: string) => {
      cache.delete(dataSourceId, dataSourceVersion);
    },
    [cache],
  );

  /**
   * Clears all cache entries (nuclear option)
   */
  const clearAllCache = useCallback(() => {
    cache.clear();
  }, [cache]);

  return {
    clearCacheForDeletedTabs,
    clearCacheForDeletedDataSources,
    clearAllTabCache,
    clearSpecificCache,
    clearAllCache,
  };
}
