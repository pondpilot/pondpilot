/**
 * Configuration constants for comparison execution
 */

/**
 * Minimum interval between progress updates to prevent UI thrashing.
 * Progress updates are throttled to at most once every 150ms per comparison.
 */
export const MIN_PROGRESS_UPDATE_INTERVAL_MS = 150;

/**
 * Maximum age for stale comparison progress entries before cleanup.
 * Entries older than 5 minutes are automatically removed to prevent memory leaks.
 */
export const PROGRESS_CLEANUP_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Interval for running the progress cleanup routine.
 * Cleanup runs every minute to remove stale entries.
 */
export const PROGRESS_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Maximum allowed modulus for hash-bucket filtering.
 * This prevents excessive resource usage from creating too many buckets.
 */
export const MAX_HASH_MODULUS = 10000;

/**
 * Maximum allowed hash range size for hash-range filtering.
 * This prevents excessive resource usage from overly large ranges.
 * Set to 2^32 (4,294,967,296) as a reasonable upper bound.
 */
export const MAX_HASH_RANGE_SIZE = 4294967296n; // 2^32
