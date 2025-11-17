/**
 * ATTACH Statement Parser
 *
 * Utilities for parsing and extracting information from SQL ATTACH statements.
 */

/**
 * Regex to parse ATTACH statements
 * Supports: ATTACH [DATABASE] [IF NOT EXISTS] 'url' AS ["]dbname["]
 *
 * Capture groups:
 * 1: The database URL (required, quoted)
 * 2: Optional opening quote for the database name (captures " or empty string)
 * 3: The database name (required, optionally quoted)
 */
export const ATTACH_STATEMENT_REGEX =
  /ATTACH\s+(?:DATABASE\s+)?(?:IF\s+NOT\s+EXISTS\s+)?['"]([^'"]+)['"]\s+AS\s+(['"]?)([^'"\s]+)\2/i;

/**
 * Parsed ATTACH statement information
 */
export interface ParsedAttachStatement {
  /** The raw URL from the ATTACH statement */
  rawUrl: string;
  /** The database name/alias */
  dbName: string;
  /** The original SQL statement */
  statement: string;
}

/**
 * Parse an ATTACH statement to extract URL and database name
 *
 * This function handles various ATTACH syntax forms:
 * - ATTACH 'url' AS dbname
 * - ATTACH DATABASE 'url' AS dbname
 * - ATTACH IF NOT EXISTS 'url' AS dbname
 * - ATTACH DATABASE IF NOT EXISTS 'url' AS dbname
 * - Both single and double quotes for URLs and names
 *
 * @param statement - The SQL statement to parse
 * @returns Parsed information, or null if not a valid ATTACH statement
 *
 * @example
 * parseAttachStatement("ATTACH 'https://example.com/db.duckdb' AS remote")
 * // Returns: { rawUrl: 'https://example.com/db.duckdb', dbName: 'remote', statement: '...' }
 *
 * @example
 * parseAttachStatement('ATTACH DATABASE IF NOT EXISTS "s3://bucket/db.duckdb" AS "my_db"')
 * // Returns: { rawUrl: 's3://bucket/db.duckdb', dbName: 'my_db', statement: '...' }
 */
export function parseAttachStatement(statement: string): ParsedAttachStatement | null {
  const match = statement.match(ATTACH_STATEMENT_REGEX);

  if (!match) {
    return null;
  }

  // Extract capture groups
  // Group 1: URL (required)
  // Group 2: Quote character for database name (optional, used for backreference)
  // Group 3: Database name (required)
  const [, rawUrl, , dbName] = match;

  // DuckDB doesn't allow semicolons in unquoted identifiers, but scripts often
  // terminate statements with `;` without whitespace ("AS mydb;"). Strip the
  // trailing semicolon so the parsed database name matches DuckDB's actual alias.
  const normalizedDbName = dbName.replace(/;$/, '');

  return {
    rawUrl,
    dbName: normalizedDbName,
    statement,
  };
}

/**
 * Parse a DETACH statement to extract the database name
 *
 * Supports:
 * - DETACH dbname
 * - DETACH DATABASE dbname
 *
 * @param statement - The SQL statement to parse
 * @returns The database name, or null if not a valid DETACH statement
 *
 * @example
 * parseDetachStatement("DETACH DATABASE mydb")
 * // Returns: 'mydb'
 */
export function parseDetachStatement(statement: string): string | null {
  // Match DETACH followed by optional DATABASE keyword, then the database name
  // Ensure the database name is not the DATABASE keyword itself
  const match = statement.match(/DETACH\s+(?:DATABASE\s+)?(\w+)/i);

  if (!match) {
    return null;
  }

  const dbName = match[1];

  // Return null if the captured name is just the keyword DATABASE
  if (dbName.toUpperCase() === 'DATABASE') {
    return null;
  }

  return dbName;
}
