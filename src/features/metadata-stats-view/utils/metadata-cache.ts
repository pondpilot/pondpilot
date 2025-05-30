/**
 * Metadata caching utilities for improved performance when switching between tabs
 */

import { useMemo } from 'react';

import { TableMetadata } from '../model';

/**
 * Cache entry with metadata and timestamp
 */
interface CacheEntry {
  metadata: TableMetadata;
  timestamp: number;
  dataSourceVersion: string;
}

/**
 * Cache configuration
 */
const CACHE_CONFIG = {
  maxEntries: 50, // Maximum number of cached entries
  maxAge: 5 * 60 * 1000, // 5 minutes in milliseconds
  cleanupInterval: 2 * 60 * 1000, // Cleanup every 2 minutes
} as const;

/**
 * In-memory cache for metadata results
 */
class MetadataCache {
  private cache = new Map<string, CacheEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Generates a robust cache key from data adapter information
   * Uses hash to prevent key collisions and sanitizes inputs
   */
  private generateCacheKey(dataSourceId: string, dataSourceVersion: string): string {
    // Sanitize inputs to prevent issues with special characters
    const cleanId = this.sanitizeKeyComponent(dataSourceId);
    const cleanVersion = this.sanitizeKeyComponent(dataSourceVersion);

    // Use a hash for additional collision resistance
    const combinedKey = `${cleanId}:${cleanVersion}`;
    return this.hashString(combinedKey);
  }

  /**
   * Sanitizes a key component to prevent issues with special characters
   */
  private sanitizeKeyComponent(component: string): string {
    if (!component || typeof component !== 'string') {
      return 'unknown';
    }

    // Remove or replace potentially problematic characters
    return component
      .replace(/[^\w\-._]/g, '_') // Replace non-alphanumeric chars with underscore
      .substring(0, 100); // Limit length
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i += 1) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36); // Base36 for shorter keys
  }

  /**
   * Stores metadata in cache
   */
  set(dataSourceId: string, dataSourceVersion: string, metadata: TableMetadata): void {
    const key = this.generateCacheKey(dataSourceId, dataSourceVersion);

    // If cache is full, remove oldest entry
    if (this.cache.size >= CACHE_CONFIG.maxEntries) {
      const oldestKey = this.getOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      metadata: this.deepClone(metadata),
      timestamp: Date.now(),
      dataSourceVersion,
    });
  }

  /**
   * Retrieves metadata from cache if valid
   */
  get(dataSourceId: string, dataSourceVersion: string): TableMetadata | null {
    const key = this.generateCacheKey(dataSourceId, dataSourceVersion);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > CACHE_CONFIG.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Check if data source version matches
    if (entry.dataSourceVersion !== dataSourceVersion) {
      this.cache.delete(key);
      return null;
    }

    // Update timestamp for LRU behavior
    entry.timestamp = Date.now();

    return this.deepClone(entry.metadata);
  }

  /**
   * Checks if metadata exists in cache
   */
  has(dataSourceId: string, dataSourceVersion: string): boolean {
    return this.get(dataSourceId, dataSourceVersion) !== null;
  }

  /**
   * Removes specific entry from cache
   */
  delete(dataSourceId: string, dataSourceVersion: string): boolean {
    const key = this.generateCacheKey(dataSourceId, dataSourceVersion);
    return this.cache.delete(key);
  }

  /**
   * Clears all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clears cache entries for a specific data source
   */
  clearDataSource(dataSourceId: string): void {
    const keysToDelete: string[] = [];

    // Find all entries that match the data source ID pattern
    for (const [key] of this.cache.entries()) {
      // Generate expected key prefix for this data source
      const cleanId = this.sanitizeKeyComponent(dataSourceId);
      const keyPrefix = this.hashString(cleanId);

      // If the key starts with our data source prefix, mark for deletion
      if (key.startsWith(keyPrefix)) {
        keysToDelete.push(key);
      }
    }

    // Delete all matching entries
    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0 && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(
        `MetadataCache: Cleared ${keysToDelete.length} entries for data source ${dataSourceId}`,
      );
    }
  }

  /**
   * Clears cache entries for all tab-based data sources
   */
  clearTabDataSources(): void {
    const keysToDelete: string[] = [];

    for (const [key] of this.cache.entries()) {
      // Check if this entry is for a tab-based data source
      // We can identify these by checking if they have the 'tab-' prefix pattern
      const tabPrefix = this.hashString(this.sanitizeKeyComponent('tab-'));
      if (key.startsWith(tabPrefix.substring(0, 3))) {
        // Use partial match for safety
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0 && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(`MetadataCache: Cleared ${keysToDelete.length} tab-based cache entries`);
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    oldestEntryAge: number;
    newestEntryAge: number;
  } {
    const now = Date.now();
    let oldestAge = 0;
    let newestAge = 0;

    if (this.cache.size > 0) {
      const timestamps = Array.from(this.cache.values()).map((entry) => entry.timestamp);
      oldestAge = now - Math.min(...timestamps);
      newestAge = now - Math.max(...timestamps);
    }

    return {
      size: this.cache.size,
      maxSize: CACHE_CONFIG.maxEntries,
      oldestEntryAge: oldestAge,
      newestEntryAge: newestAge,
    };
  }

  /**
   * Gets the key of the oldest cache entry
   */
  private getOldestEntry(): string | null {
    if (this.cache.size === 0) return null;

    let oldestKey = '';
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey || null;
  }

  /**
   * Removes expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_CONFIG.maxAge) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));

    if (expiredKeys.length > 0 && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(`MetadataCache: Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Starts the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CACHE_CONFIG.cleanupInterval);
  }

  /**
   * Stops the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Deep clones metadata to prevent mutations
   */
  private deepClone<T>(obj: T): T {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (error) {
      console.warn('MetadataCache: Failed to clone object, returning original', error);
      return obj;
    }
  }

  /**
   * Cleanup resources when cache is destroyed
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// Global cache instance
const metadataCache = new MetadataCache();

// Export cache instance and utilities
export { metadataCache };

/**
 * Hook-friendly cache interface
 */
export const useMetadataCache = () => {
  return useMemo(
    () => ({
      get: metadataCache.get.bind(metadataCache),
      set: metadataCache.set.bind(metadataCache),
      has: metadataCache.has.bind(metadataCache),
      delete: metadataCache.delete.bind(metadataCache),
      clear: metadataCache.clear.bind(metadataCache),
      clearDataSource: metadataCache.clearDataSource.bind(metadataCache),
      clearTabDataSources: metadataCache.clearTabDataSources.bind(metadataCache),
      getStats: metadataCache.getStats.bind(metadataCache),
    }),
    [],
  );
};

/**
 * React hook for accessing cache statistics (useful for debugging/monitoring)
 */
export const useMetadataCacheStats = () => {
  return metadataCache.getStats();
};
