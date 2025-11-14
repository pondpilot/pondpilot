type CacheEntry = {
  value: number;
  expiresAt: number;
  lastAccessed: number;
};

const ROW_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const ROW_COUNT_CACHE_MAX_ENTRIES = 128;

const cache = new Map<string, CacheEntry>();

const now = () => Date.now();

const pruneExpired = () => {
  const timestamp = now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= timestamp) {
      cache.delete(key);
    }
  }
};

const enforceCapacity = () => {
  if (cache.size <= ROW_COUNT_CACHE_MAX_ENTRIES) {
    return;
  }

  const entries = Array.from(cache.entries());
  entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  const excess = cache.size - ROW_COUNT_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess; i += 1) {
    cache.delete(entries[i][0]);
  }
};

export const buildRowCountCacheKey = (source: {
  type: 'table' | 'query';
  databaseName?: string | null;
  schemaName?: string | null;
  tableName?: string;
  sql?: string;
}): string | null => {
  if (source.type === 'table') {
    const databaseName = source.databaseName ?? '';
    const schemaName = source.schemaName ?? 'main';
    const { tableName } = source;
    if (!tableName) {
      return null;
    }
    return `table:${databaseName}:${schemaName}:${tableName}`;
  }

  if (source.type === 'query') {
    if (!source.sql) {
      return null;
    }
    return `query:${source.sql}`;
  }

  return null;
};

export const getCachedRowCount = (cacheKey: string): number | null => {
  pruneExpired();
  const entry = cache.get(cacheKey);
  if (!entry) {
    return null;
  }

  entry.lastAccessed = now();
  return entry.value;
};

export const setCachedRowCount = (cacheKey: string, value: number): void => {
  const timestamp = now();
  cache.set(cacheKey, {
    value,
    expiresAt: timestamp + ROW_COUNT_CACHE_TTL_MS,
    lastAccessed: timestamp,
  });
  enforceCapacity();
};

export const invalidateRowCountCacheKey = (cacheKey: string): void => {
  cache.delete(cacheKey);
};

export const invalidateRowCountCacheForDatabase = (databaseName: string): void => {
  const prefix = `table:${databaseName}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

export const clearRowCountCache = (): void => {
  cache.clear();
};

export const getRowCountCacheSize = (): number => cache.size;

export const ROW_COUNT_CACHE_TEST_CONSTANTS = {
  TTL_MS: ROW_COUNT_CACHE_TTL_MS,
  MAX_ENTRIES: ROW_COUNT_CACHE_MAX_ENTRIES,
};
