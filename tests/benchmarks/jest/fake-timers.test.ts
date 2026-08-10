import {
  ROW_COUNT_CACHE_TEST_CONSTANTS,
  buildRowCountCacheKey,
  clearRowCountCache,
  getCachedRowCount,
  getRowCountCacheSize,
  setCachedRowCount,
} from '@features/comparison/hooks/row-count-cache';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('fake timer migration contract', () => {
  beforeEach(() => {
    clearRowCountCache();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    clearRowCountCache();
  });

  it('[pilot:timer.fresh-entry] returns a fresh cached value', () => {
    const key = buildRowCountCacheKey({ type: 'query', sql: 'select 1' });

    expect(key).not.toBeNull();
    setCachedRowCount(key!, 42);
    expect(getCachedRowCount(key!)).toBe(42);
  });

  it('[pilot:timer.ttl-expiry] expires an entry after its TTL', () => {
    const key = buildRowCountCacheKey({ type: 'query', sql: 'select 1' });

    expect(key).not.toBeNull();
    setCachedRowCount(key!, 42);
    jest.advanceTimersByTime(ROW_COUNT_CACHE_TEST_CONSTANTS.TTL_MS + 1);
    expect(getCachedRowCount(key!)).toBeNull();
  });

  it('[pilot:timer.capacity] keeps the cache within its capacity', () => {
    const { MAX_ENTRIES } = ROW_COUNT_CACHE_TEST_CONSTANTS;

    for (let index = 0; index <= MAX_ENTRIES; index += 1) {
      setCachedRowCount(`key-${index}`, index);
    }

    expect(getRowCountCacheSize()).toBe(MAX_ENTRIES);
    expect(getCachedRowCount(`key-${MAX_ENTRIES}`)).toBe(MAX_ENTRIES);
  });
});
