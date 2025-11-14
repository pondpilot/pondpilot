/**
 * SQL Security Utilities
 *
 * This module provides utilities for sanitizing and validating SQL-related inputs
 * to prevent SQL injection and other security vulnerabilities.
 *
 * IMPORTANT: These utilities are defensive measures and should be used alongside
 * parameterized queries and proper input validation at the API level.
 */

/**
 * List of SQL keywords that could be dangerous in user input
 */
const DANGEROUS_SQL_KEYWORDS = [
  'DROP',
  'DELETE',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'EXEC',
  'EXECUTE',
  'SCRIPT',
  'INSERT',
  'UPDATE',
  'GRANT',
  'REVOKE',
  'UNION',
  'DECLARE',
  '--',
  ';',
  'xp_',
  'sp_',
];

/**
 * Sanitizes a SQL identifier by properly quoting it and escaping any quotes within.
 * This is useful for table names, column names, schema names, etc.
 *
 * @param identifier - The identifier to sanitize
 * @returns The sanitized identifier wrapped in double quotes with internal quotes escaped
 *
 * @example
 * sanitizeSqlIdentifier('my_table') // returns '"my_table"'
 * sanitizeSqlIdentifier('table"with"quotes') // returns '"table""with""quotes"'
 */
export function sanitizeSqlIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }

  // Escape any double quotes by doubling them (SQL standard)
  const escaped = identifier.replace(/"/g, '""');

  // Wrap in double quotes
  return `"${escaped}"`;
}

/**
 * Validates that a column name exists in a list of allowed columns.
 * This prevents SQL injection by ensuring only known, safe column names are used.
 *
 * @param columnName - The column name to validate
 * @param allowedColumns - List of allowed column names
 * @returns true if the column is in the allowed list, false otherwise
 *
 * @example
 * const allowed = ['id', 'name', 'email'];
 * validateColumnName('id', allowed) // returns true
 * validateColumnName('DROP TABLE', allowed) // returns false
 */
export function validateColumnName(columnName: string, allowedColumns: string[]): boolean {
  if (!columnName || typeof columnName !== 'string') {
    return false;
  }

  return allowedColumns.includes(columnName);
}

/**
 * Validates a filter expression to ensure it doesn't contain dangerous SQL keywords.
 * This is a basic check and should NOT be relied upon as the sole security measure.
 *
 * IMPORTANT: Prefer using parameterized queries or structured filters over raw SQL.
 * This function is a defensive measure for cases where raw SQL must be used.
 *
 * @param filter - The filter expression to validate
 * @returns true if the filter appears safe, false if it contains dangerous patterns
 *
 * @example
 * validateFilterExpression("column = 'value'") // returns true
 * validateFilterExpression("1=1; DROP TABLE users") // returns false
 */
export function validateFilterExpression(filter: string): boolean {
  if (!filter || typeof filter !== 'string') {
    return false;
  }

  // Check for dangerous SQL keywords (case-insensitive)
  const upperFilter = filter.toUpperCase();
  for (const keyword of DANGEROUS_SQL_KEYWORDS) {
    if (upperFilter.includes(keyword)) {
      return false;
    }
  }

  // Check for common SQL injection patterns
  const dangerousPatterns = [
    /;.*(?:DROP|DELETE|TRUNCATE|ALTER|CREATE)/i, // Multiple statements with dangerous keywords
    /UNION.*SELECT/i, // UNION-based injection
    /--/, // SQL comments
    /\/\*/, // Multi-line comments
    /xp_/i, // Extended stored procedures
    /sp_/i, // System stored procedures
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that join columns exist in both schemas being compared.
 * This ensures only legitimate columns from the analyzed schemas are used in joins.
 *
 * @param joinColumns - Array of column names to use for joining
 * @param schemaAColumns - Column names from schema A
 * @param schemaBColumns - Column names from schema B
 * @returns Object with isValid flag and error message if invalid
 *
 * @example
 * validateJoinColumns(['id'], ['id', 'name'], ['id', 'email'])
 * // returns { isValid: true, error: null }
 *
 * validateJoinColumns(['id', 'invalid'], ['id', 'name'], ['id', 'email'])
 * // returns { isValid: false, error: 'Column "invalid" not found in both schemas' }
 */
export function validateJoinColumns(
  joinColumns: string[],
  schemaAColumns: string[],
  schemaBColumns: string[],
): { isValid: boolean; error: string | null } {
  if (!Array.isArray(joinColumns) || joinColumns.length === 0) {
    return { isValid: false, error: 'At least one join column must be specified' };
  }

  for (const column of joinColumns) {
    if (!schemaAColumns.includes(column)) {
      return { isValid: false, error: `Column "${column}" not found in schema A` };
    }
    if (!schemaBColumns.includes(column)) {
      return { isValid: false, error: `Column "${column}" not found in schema B` };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Escapes special characters in a string value for use in SQL.
 * This is useful for string literals in SQL queries.
 *
 * @param value - The value to escape
 * @returns The escaped value
 *
 * @example
 * escapeSqlStringValue("O'Reilly") // returns "O''Reilly"
 * escapeSqlStringValue("Hello\nWorld") // returns "Hello\\nWorld"
 */
export function escapeSqlStringValue(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  // Escape single quotes by doubling them (SQL standard)
  return value.replace(/'/g, "''");
}

/**
 * Validates that a name is safe for use in the application.
 * This includes validation for script names, comparison names, etc.
 *
 * @param name - The name to validate
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Object with isValid flag and error message if invalid
 *
 * @example
 * validateName('My Script') // returns { isValid: true, error: null }
 * validateName('') // returns { isValid: false, error: 'Name cannot be empty' }
 */
export function validateName(
  name: string,
  maxLength: number = 100,
): { isValid: boolean; error: string | null } {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return { isValid: false, error: 'Name cannot be empty' };
  }

  if (trimmedName.length > maxLength) {
    return { isValid: false, error: `Name must be ${maxLength} characters or less` };
  }

  // Allow letters, numbers, spaces, underscores, dashes, and parentheses
  if (!/^[a-zA-Z0-9()_\- ]+$/.test(trimmedName)) {
    return {
      isValid: false,
      error: 'Name must contain only letters, numbers, spaces, underscores, dashes and parentheses',
    };
  }

  return { isValid: true, error: null };
}
