import { useMap } from '@mantine/hooks';
import { TabId } from '@models/tab';
import { useCallback } from 'react';

/**
 * Hook for implementing an LRU (Least Recently Used) tab cache
 * @param maxSize Maximum number of tabs to keep in cache
 * @returns Object with methods to work with the cache
 */
export function useTabCache(maxSize = 10) {
  // Using a Map to maintain insertion order (oldest first)
  const cachedTabs = useMap<TabId, boolean>([]);

  /**
   * Adds a tab to cache or moves it to the most recently used position
   * @param tabId ID of the tab to add/update
   */
  const addToCache = useCallback(
    (tabId: TabId) => {
      if (cachedTabs.has(tabId)) {
        // If tab already exists, remove it first to update its position
        cachedTabs.delete(tabId);
      } else if (cachedTabs.size >= maxSize) {
        // If we're at max capacity and adding a new tab
        // Remove the oldest item (first key in the Map)
        const oldestKey = cachedTabs.keys().next().value;

        // Theoretically with maxSize 0, oldestKey will be undefined
        if (oldestKey) cachedTabs.delete(oldestKey);
      }

      // Add/re-add the tab at the end (most recently used position)
      cachedTabs.set(tabId, true);
    },
    [cachedTabs, maxSize],
  );

  /**
   * Checks if a tab is in the cache
   * @param tabId ID of the tab to check
   * @returns true if tab is cached
   */
  const isTabCached = useCallback((tabId: TabId) => cachedTabs.has(tabId), [cachedTabs]);

  /**
   * Removes a tab from the cache
   * @param tabId ID of the tab to remove
   */
  const removeFromCache = useCallback(
    (tabId: TabId) => {
      cachedTabs.delete(tabId);
    },
    [cachedTabs],
  );

  /**
   * Clears the entire cache
   */
  const clearCache = useCallback(() => {
    cachedTabs.clear();
  }, [cachedTabs]);

  /**
   * Returns the current cache as an array
   * Newest (most recently used) items will be at the end
   */
  const getCachedTabIds = useCallback(() => {
    return Array.from(cachedTabs.keys());
  }, [cachedTabs]);

  return {
    addToCache,
    isTabCached,
    removeFromCache,
    clearCache,
    getCachedTabIds,
  };
}
