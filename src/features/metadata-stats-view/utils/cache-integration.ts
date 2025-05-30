/**
 * Cache integration utilities for controllers
 *
 * These utilities provide a way for controllers to clear metadata cache
 * without directly importing React hooks, maintaining separation of concerns.
 */

import { metadataCache } from './metadata-cache';

/**
 * Clears cache entries for deleted tabs
 */
export function clearCacheForDeletedTabs(tabIds: string[]): void {
  tabIds.forEach((tabId) => {
    const dataSourceId = `tab-${tabId}`;
    metadataCache.clearDataSource(dataSourceId);
  });
}

/**
 * Clears cache entries for deleted data sources
 */
export function clearCacheForDeletedDataSources(dataSourceIds: string[]): void {
  dataSourceIds.forEach((dataSourceId) => {
    metadataCache.clearDataSource(dataSourceId);
  });
}

/**
 * Clears all tab-based cache entries
 */
export function clearAllTabCache(): void {
  metadataCache.clearTabDataSources();
}

/**
 * Clears specific cache entry by data source and version
 */
export function clearSpecificCache(dataSourceId: string, dataSourceVersion: string): void {
  metadataCache.delete(dataSourceId, dataSourceVersion);
}

/**
 * Clears all cache entries
 */
export function clearAllCache(): void {
  metadataCache.clear();
}
