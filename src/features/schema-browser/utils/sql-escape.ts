/**
 * Escape a SQL identifier (database, schema, or table name) to prevent SQL injection
 * DuckDB uses double quotes for identifiers that need escaping
 *
 * @param identifier - The SQL identifier to escape (table, column, schema name, etc.)
 * @returns The properly escaped identifier wrapped in double quotes
 * @throws Error if identifier is empty
 *
 * @example
 * ```ts
 * escapeIdentifier('my-table'); // Returns: "my-table"
 * escapeIdentifier('table"name'); // Returns: "table""name"
 * ```
 */
export function escapeIdentifier(identifier: string): string {
  if (!identifier) {
    throw new Error('Identifier cannot be empty');
  }

  // Double any existing double quotes in the identifier
  const escaped = identifier.replace(/"/g, '""');

  // Wrap in double quotes
  return `"${escaped}"`;
}

/**
 * Escape multiple identifiers and join them with dots for qualified names
 *
 * @param identifiers - Variable number of identifiers to escape and join
 * @returns The properly escaped qualified name
 *
 * @example
 * ```ts
 * escapeQualifiedName('schema', 'table'); // Returns: "schema"."table"
 * escapeQualifiedName('db', 'schema', 'table'); // Returns: "db"."schema"."table"
 * ```
 */
export function escapeQualifiedName(...identifiers: string[]): string {
  return identifiers.map(escapeIdentifier).join('.');
}

/**
 * Escape a string literal for use in SQL queries
 * Single quotes are doubled to escape them
 *
 * @param value - The string value to escape, or null/undefined
 * @returns The properly escaped string literal wrapped in single quotes, or 'NULL'
 *
 * @example
 * ```ts
 * escapeStringLiteral("O'Reilly"); // Returns: 'O''Reilly'
 * escapeStringLiteral("Line 1\nLine 2"); // Returns: 'Line 1\nLine 2'
 * escapeStringLiteral(null); // Returns: 'NULL'
 * ```
 */
export function escapeStringLiteral(value: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  // Double any single quotes in the string
  const escaped = value.replace(/'/g, "''");
  // Wrap in single quotes
  return `'${escaped}'`;
}
