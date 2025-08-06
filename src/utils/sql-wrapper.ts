/**
 * Default row limit for queries to prevent memory exhaustion
 */
export const DEFAULT_ROW_LIMIT = 10000;

/**
 * Wraps a SQL query with a row limit to prevent loading too much data into memory.
 * Only used for WASM connections. Tauri connections use Arrow streaming instead.
 *
 * @param sql The SQL query to wrap
 * @param limit Optional custom limit (defaults to DEFAULT_ROW_LIMIT)
 * @returns The query with LIMIT clause added if appropriate
 */
export function wrapQueryWithLimit(sql: string, limit: number = DEFAULT_ROW_LIMIT): string {
  // Trim and normalize whitespace
  const normalizedSql = sql.trim();

  // Check if query already has a LIMIT clause
  // This regex checks for LIMIT at word boundaries to avoid false positives
  const hasLimit = /\bLIMIT\s+\d+/i.test(normalizedSql);
  if (hasLimit) {
    return sql; // Return unchanged if already has limit
  }

  // Check if this is a query that should have a limit
  // DDL statements, PRAGMA, extension commands, etc. should not have limits
  const shouldNotLimit =
    /^(CREATE|ALTER|DROP|PRAGMA|VACUUM|ANALYZE|EXPLAIN|ATTACH|DETACH|INSERT|UPDATE|DELETE|TRUNCATE|INSTALL|LOAD|SET|RESET|SHOW|DESCRIBE|DESC|COPY|IMPORT|EXPORT)\s/i.test(
      normalizedSql,
    );
  if (shouldNotLimit) {
    return sql; // Return unchanged for non-SELECT statements
  }

  // Check if it's a CTE or subquery that might need special handling
  const hasCTE = /^\s*WITH\s+/i.test(normalizedSql);
  if (hasCTE) {
    // For CTEs, we need to add LIMIT to the final SELECT
    // This is a simplified approach - in production, use a proper SQL parser
    const lastSelectIndex = normalizedSql.lastIndexOf(/\bSELECT\b/i.source);
    if (lastSelectIndex !== -1) {
      // Find the end of the query, accounting for potential ORDER BY
      const orderByMatch = normalizedSql.match(/\bORDER\s+BY\s+[^;]+$/i);
      if (orderByMatch) {
        // Insert LIMIT before ORDER BY
        const orderByIndex = normalizedSql.lastIndexOf(orderByMatch[0]);
        return `${normalizedSql.slice(0, orderByIndex)}LIMIT ${limit} ${normalizedSql.slice(
          orderByIndex,
        )}`;
      }
    }
  }

  // For regular SELECT queries, append LIMIT at the end
  // Check for trailing semicolon
  const hasSemicolon = normalizedSql.endsWith(';');
  if (hasSemicolon) {
    return `${normalizedSql.slice(0, -1)} LIMIT ${limit};`;
  }
  return `${normalizedSql} LIMIT ${limit}`;
}

/**
 * Checks if a query result was likely truncated by hitting the row limit
 */
export function isResultTruncated(rowCount: number, limit: number = DEFAULT_ROW_LIMIT): boolean {
  return rowCount === limit;
}
