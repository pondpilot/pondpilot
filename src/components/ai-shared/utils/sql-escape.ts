/**
 * Escapes a string value for safe inclusion in SQL queries.
 * This is used to prevent SQL injection when parameterized queries are not available.
 *
 * Note: This function escapes single quotes by doubling them, which is the standard
 * SQL escaping mechanism. However, parameterized queries should be preferred when available.
 *
 * @param value The string value to escape
 * @returns The escaped string safe for SQL inclusion
 */
export function escapeSqlString(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('escapeSqlString expects a string value');
  }

  // Replace single quotes with doubled single quotes
  // This is the standard SQL escaping for string literals
  return value.replace(/'/g, "''");
}

/**
 * Escapes an identifier (table name, column name, etc.) for safe inclusion in SQL queries.
 * This wraps the identifier in double quotes and escapes any internal double quotes.
 *
 * @param identifier The identifier to escape
 * @returns The escaped identifier safe for SQL inclusion
 */
export function escapeSqlIdentifier(identifier: string): string {
  if (typeof identifier !== 'string') {
    throw new Error('escapeSqlIdentifier expects a string value');
  }

  // Replace double quotes with doubled double quotes and wrap in double quotes
  // This is the standard SQL escaping for identifiers
  return `"${identifier.replace(/"/g, '""')}"`;
}
