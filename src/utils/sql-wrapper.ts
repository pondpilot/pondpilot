/**
 * Default row limit for queries to prevent memory exhaustion
 */
export const DEFAULT_ROW_LIMIT = 10000;

/**
 * Wraps a SQL query with a row limit to prevent loading too much data into memory.
 * This should be used consistently across all database engines (WASM, Tauri, etc.)
 * 
 * @param sql The SQL query to wrap
 * @param limit Optional custom limit (defaults to DEFAULT_ROW_LIMIT)
 * @returns The query unchanged (wrapping removed)
 */
export function wrapQueryWithLimit(sql: string, limit: number = DEFAULT_ROW_LIMIT): string {
  // Return the query unchanged - no wrapping applied
  return sql;
}

/**
 * Checks if a query result was likely truncated by hitting the row limit
 */
export function isResultTruncated(rowCount: number, limit: number = DEFAULT_ROW_LIMIT): boolean {
  return rowCount === limit;
}