/**
 * Serialization utilities for persisting tab data to IndexedDB.
 *
 * DuckDB-wasm returns special Row proxy objects from Apache Arrow that cannot be
 * stored in IndexedDB using the structured clone algorithm. These utilities ensure
 * data is properly serialized before persistence.
 */

import { DataRow } from '@models/db';

/**
 * Converts data rows to IndexedDB-compatible plain objects.
 *
 * This function deeply serializes data to ensure all nested objects are plain
 * JavaScript objects that can be stored in IndexedDB.
 *
 * Type transformations:
 * - BigInt values are converted to strings (lossy - cannot be reversed automatically)
 * - Date objects are converted to ISO strings
 * - DuckDB Row proxy objects are converted to plain objects
 * - Circular references will cause serialization to fail gracefully
 *
 * @param data - Array of data rows to serialize
 * @returns Serialized array safe for IndexedDB storage, or empty array on failure
 *
 * @example
 * ```ts
 * const rows = await queryDuckDB('SELECT * FROM table');
 * const serializable = toSerializableRows(rows);
 * await indexedDB.put('table', serializable);
 * ```
 */
export function toSerializableRows(data: DataRow[] | undefined | null): DataRow[] {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  try {
    return JSON.parse(
      JSON.stringify(data, (_key, value) => {
        // BigInt is not supported by JSON.stringify - convert to string
        // Note: This is a lossy conversion. Consumers must handle BigInt fields as strings.
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }),
    );
  } catch (error) {
    // Serialization can fail on circular references or other edge cases.
    // Log the error but don't crash - stale data cache is non-critical.
    console.error('[Serialize] Failed to serialize rows for IndexedDB:', error);
    return [];
  }
}
