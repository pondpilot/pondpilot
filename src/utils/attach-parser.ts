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
/**
 * Parsed Iceberg ATTACH statement information
 */
export interface ParsedIcebergAttachStatement {
  /** Warehouse name (quoted value after ATTACH) */
  warehouseName: string;
  /** Catalog alias (identifier after AS) */
  catalogAlias: string;
  /** REST catalog endpoint URL from ENDPOINT option */
  endpoint?: string;
  /** Endpoint type from ENDPOINT_TYPE option (GLUE, S3_TABLES) */
  endpointType?: string;
  /** Secret name from SECRET option */
  secretName?: string;
  /** The original SQL statement */
  statement: string;
}

/**
 * Regex to match the overall ATTACH structure including the parenthesized options block.
 *
 * Capture groups:
 * 1: The warehouse/URL value (required, quoted with ' or ")
 * 2: The catalog alias if double-quoted (e.g. "my-catalog")
 * 3: The catalog alias if unquoted (word characters only)
 * 4: The options block content inside parentheses
 */
const ICEBERG_ATTACH_REGEX =
  /ATTACH\s+(?:DATABASE\s+)?(?:IF\s+NOT\s+EXISTS\s+)?['"]([^'"]+)['"]\s+AS\s+(?:"([^"]+)"|(\w+))\s*\(([^)]+)\)/i;

/**
 * Parse an Iceberg ATTACH statement to extract warehouse, alias, and options.
 *
 * This handles the DuckDB Iceberg ATTACH syntax:
 *   ATTACH 'warehouse' AS alias (TYPE ICEBERG, ENDPOINT '...', SECRET secret_name)
 *
 * Returns null if the statement is not an Iceberg ATTACH (i.e., no TYPE ICEBERG
 * found in the options block), allowing fallthrough to the existing remote DB handler.
 *
 * @param statement - The SQL statement to parse
 * @returns Parsed Iceberg information, or null if not an Iceberg ATTACH
 */
export function parseIcebergAttachStatement(
  statement: string,
): ParsedIcebergAttachStatement | null {
  const match = statement.match(ICEBERG_ATTACH_REGEX);
  if (!match) {
    return null;
  }

  const [, warehouseName, quotedAlias, unquotedAlias, optionsBlock] = match;
  const catalogAlias = (quotedAlias ?? unquotedAlias);

  // Verify TYPE ICEBERG is present in the options block
  if (!/\bTYPE\s+ICEBERG\b/i.test(optionsBlock)) {
    return null;
  }

  // Extract individual options from the options block
  const endpoint = extractQuotedOption(optionsBlock, 'ENDPOINT');
  const endpointType =
    extractQuotedOption(optionsBlock, 'ENDPOINT_TYPE') ??
    extractUnquotedOption(optionsBlock, 'ENDPOINT_TYPE');
  const secretName = extractUnquotedOption(optionsBlock, 'SECRET');

  return {
    warehouseName,
    catalogAlias: catalogAlias.replace(/;$/, ''),
    endpoint,
    endpointType,
    secretName,
    statement,
  };
}

/**
 * Extract a quoted option value from an options block.
 * Matches: KEY 'value' or KEY "value"
 */
function extractQuotedOption(optionsBlock: string, key: string): string | undefined {
  const regex = new RegExp(`\\b${key}\\s+['"]([^'"]+)['"]`, 'i');
  const match = optionsBlock.match(regex);
  return match?.[1];
}

/**
 * Extract an unquoted option value from an options block.
 * Matches: KEY value (word characters only)
 */
function extractUnquotedOption(optionsBlock: string, key: string): string | undefined {
  const regex = new RegExp(`\\b${key}\\s+([\\w-]+)`, 'i');
  const match = optionsBlock.match(regex);
  return match?.[1];
}

/**
 * Parsed CREATE SECRET statement information
 */
export interface ParsedCreateSecretStatement {
  /** Secret name identifier */
  secretName: string;
  /** Secret type (e.g. 's3', 'iceberg', etc.) */
  secretType: string;
  /** Key-value options extracted from the statement */
  options: Record<string, string>;
  /** The original SQL statement */
  statement: string;
}

/**
 * Regex to match CREATE SECRET statements.
 *
 * Supports: CREATE [OR REPLACE] SECRET [IF NOT EXISTS] name (TYPE type, ...)
 *
 * Capture groups:
 * 1: Secret name if double-quoted (e.g. "my-secret")
 * 2: Secret name if unquoted (word characters only)
 * 3: Options block content inside parentheses
 */
const CREATE_SECRET_REGEX =
  /CREATE\s+(?:OR\s+REPLACE\s+)?SECRET\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))\s*\(([^)]+)\)/i;

/**
 * Parse a CREATE SECRET statement to extract the secret name, type, and options.
 *
 * @param statement - The SQL statement to parse
 * @returns Parsed information, or null if not a valid CREATE SECRET statement
 */
export function parseCreateSecretStatement(
  statement: string,
): ParsedCreateSecretStatement | null {
  const match = statement.match(CREATE_SECRET_REGEX);
  if (!match) return null;

  const [, quotedName, unquotedName, optionsBlock] = match;
  const secretName = quotedName ?? unquotedName;

  // Extract TYPE (required)
  const typeMatch = optionsBlock.match(/\bTYPE\s+(\w+)/i);
  if (!typeMatch) return null;
  const secretType = typeMatch[1].toLowerCase();

  // Extract key-value pairs from the options block
  const options: Record<string, string> = {};
  // Match KEY 'value' or KEY "value" patterns
  const quotedOptionRegex = /\b(\w+)\s+['"]([^'"]*)['"]/gi;
  let optionMatch: RegExpExecArray | null;
  while ((optionMatch = quotedOptionRegex.exec(optionsBlock)) !== null) {
    const [, rawKey, value] = optionMatch;
    const key = rawKey.toUpperCase();
    if (key !== 'TYPE') {
      options[key] = value;
    }
  }

  // Also extract unquoted values for known keys like REGION
  const KNOWN_UNQUOTED_KEYS = ['REGION', 'ENDPOINT', 'ENDPOINT_TYPE'];
  for (const knownKey of KNOWN_UNQUOTED_KEYS) {
    if (!options[knownKey]) {
      const unquotedVal = extractUnquotedOption(optionsBlock, knownKey);
      if (unquotedVal && unquotedVal.toUpperCase() !== 'TYPE') {
        options[knownKey] = unquotedVal;
      }
    }
  }

  return {
    secretName,
    secretType,
    options,
    statement,
  };
}

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
