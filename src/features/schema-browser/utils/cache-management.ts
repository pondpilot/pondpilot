import { SchemaBrowserTab } from '@models/tab';

import { CACHE_TTL } from '../constants';
import { SchemaGraph } from '../model';

// Cache for schema data with TTL
const schemaDataCache = new Map<string, { data: SchemaGraph; timestamp: number }>();

/**
 * Clear expired entries from the cache
 */
export function clearExpiredCache() {
  const now = Date.now();
  for (const [key, value] of schemaDataCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      schemaDataCache.delete(key);
    }
  }
}

/**
 * Create a cache key for the tab configuration using JSON serialization
 * to avoid delimiter collisions
 */
export function createCacheKey(tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>): string {
  return JSON.stringify({
    sourceType: tab.sourceType,
    sourceId: tab.sourceId || null,
    schemaName: tab.schemaName || null,
    objectNames: tab.objectNames || [],
  });
}

/**
 * Get cached schema data
 * @param cacheKey - The cache key
 * @returns Cached schema data or null if not found or expired
 */
export function getCachedSchemaData(cacheKey: string): SchemaGraph | null {
  const cached = schemaDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Set cached schema data
 * @param cacheKey - The cache key
 * @param data - The schema data to cache
 */
export function setCachedSchemaData(cacheKey: string, data: SchemaGraph): void {
  schemaDataCache.set(cacheKey, { data, timestamp: Date.now() });
}

/**
 * Clear all cached data
 */
export function clearAllCache(): void {
  schemaDataCache.clear();
}
