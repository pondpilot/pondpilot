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
 * @returns The wrapped query with a limit
 */
export function wrapQueryWithLimit(sql: string, limit: number = DEFAULT_ROW_LIMIT): string {
  const trimmedSql = sql.trim();
  const upperSql = trimmedSql.toUpperCase();
  
  // Don't wrap non-SELECT queries
  if (!upperSql.startsWith('SELECT')) {
    return sql;
  }
  
  // Don't wrap queries that already have a LIMIT
  if (upperSql.includes(' LIMIT ')) {
    return sql;
  }
  
  // Don't wrap CTEs - they often have their own limits internally
  if (upperSql.startsWith('WITH ')) {
    return sql;
  }
  
  // Wrap the query with a subquery and limit
  return `SELECT * FROM (${trimmedSql}) AS wrapped_query LIMIT ${limit}`;
}

/**
 * Checks if a query result was likely truncated by hitting the row limit
 */
export function isResultTruncated(rowCount: number, limit: number = DEFAULT_ROW_LIMIT): boolean {
  return rowCount === limit;
}