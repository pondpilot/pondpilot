import { DuckDBVector } from '../types';

/**
 * Extracts an array from a DuckDBVector or standard array
 * Handles various DuckDBVector APIs and fallbacks
 *
 * @param vec - DuckDB vector or standard array
 * @returns Array of extracted values
 */
export function vectorToArray<T = string>(vec: DuckDBVector<T> | T[]): T[] {
  // Already an array
  if (Array.isArray(vec)) {
    return vec;
  }

  // Has toArray method
  if (typeof vec?.toArray === 'function') {
    return vec.toArray();
  }

  // Has get method and length property
  if (typeof vec?.get === 'function' && typeof vec?.length === 'number') {
    const result: T[] = [];
    for (let i = 0; i < vec.length; i += 1) {
      result.push(vec.get(i));
    }
    return result;
  }

  // Fallback to empty array
  return [];
}
