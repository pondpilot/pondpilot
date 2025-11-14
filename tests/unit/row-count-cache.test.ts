import {
  ROW_COUNT_CACHE_TEST_CONSTANTS,
  buildRowCountCacheKey,
  clearRowCountCache,
  getCachedRowCount,
  getRowCountCacheSize,
  setCachedRowCount,
} from '@features/comparison/hooks/row-count-cache';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';

const advanceTime = (ms: number) => {
  const next = Date.now() + ms;
  jest.setSystemTime(next);
  jest.advanceTimersByTime(ms);
};

describe('row-count-cache', () => {
  beforeEach(() => {
    clearRowCountCache();
    jest.useFakeTimers();
    const base = new Date('2024-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(base);
  });

  afterEach(() => {
    jest.useRealTimers();
    clearRowCountCache();
  });

  it('returns cached row count while entry is fresh', () => {
    const key = buildRowCountCacheKey({
      type: 'table',
      databaseName: 'pondpilot',
      schemaName: 'main',
      tableName: 'demo',
    });
    expect(key).not.toBeNull();

    setCachedRowCount(key!, 123);
    const cached = getCachedRowCount(key!);
    expect(cached).toBe(123);
  });

  it('expires entries after TTL', () => {
    const key = buildRowCountCacheKey({
      type: 'query',
      sql: 'select 1',
    });
    expect(key).not.toBeNull();

    setCachedRowCount(key!, 42);
    advanceTime(ROW_COUNT_CACHE_TEST_CONSTANTS.TTL_MS + 1);

    const cached = getCachedRowCount(key!);
    expect(cached).toBeNull();
  });

  it('enforces maximum capacity using LRU eviction', () => {
    const { MAX_ENTRIES } = ROW_COUNT_CACHE_TEST_CONSTANTS;
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      setCachedRowCount(`key-${i}`, i);
    }
    expect(getRowCountCacheSize()).toBe(MAX_ENTRIES);

    setCachedRowCount('overflow', 999);
    expect(getRowCountCacheSize()).toBeLessThanOrEqual(MAX_ENTRIES);
    const maybeValue = getCachedRowCount('overflow');
    expect(maybeValue).toBe(999);
  });
});
