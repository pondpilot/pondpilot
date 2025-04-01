import { useCallback, useEffect } from 'react';
import { useSet } from '@mantine/hooks';

/**
 * Hook for caching tabs using Mantine's useSet
 * @param maxSize Maximum number of tabs to keep in cache
 * @returns Object with methods to work with the cache
 */
export function useTabCache(maxSize = 10) {
  // Use Mantine's useSet with proper typing
  const cachedTabs = useSet<string>(['']);

  /**
   * Adds a tab to cache
   * @param tabId ID of the tab to add
   */
  const addToCache = useCallback(
    (tabId: string) => {
      // If we're at max capacity and adding a new tab
      if (cachedTabs.size >= maxSize && !cachedTabs.has(tabId)) {
        // Simple approach: if we need to remove one, just remove the first one
        if (cachedTabs.size > 0) {
          const firstItem = Array.from(cachedTabs)[0];
          cachedTabs.delete(firstItem);
        }
      }

      // Add the new tab
      cachedTabs.add(tabId);
    },
    [cachedTabs, maxSize],
  );

  /**
   * Checks if a tab is in the cache
   * @param tabId ID of the tab to check
   * @returns true if tab is cached
   */
  const isTabCached = useCallback((tabId: string) => cachedTabs.has(tabId), [cachedTabs]);

  /**
   * Removes a tab from the cache
   * @param tabId ID of the tab to remove
   */
  const removeFromCache = useCallback(
    (tabId: string) => {
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

  // Initialize with empty string and then clear it to avoid type issues
  useEffect(() => {
    cachedTabs.delete('');
  }, []);

  return {
    addToCache,
    isTabCached,
    removeFromCache,
    clearCache,
    // Convert Set to array for easier consumption
    cachedTabIds: Array.from(cachedTabs),
  };
}
