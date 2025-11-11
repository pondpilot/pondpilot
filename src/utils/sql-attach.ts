import {
  wrapWithCorsProxyPathBased,
  convertS3ToHttps,
} from '@utils/cors-proxy-config';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

import { isRemoteUrl } from './url-helpers';

/**
 * Allowed URL schemes for ATTACH statements
 */
const ALLOWED_SCHEMES = ['https://', 'http://', 's3://', 'gcs://', 'azure://', 'md:'] as const;

/**
 * Regular expression for validating database names
 * Only allows alphanumeric characters, underscores, and hyphens
 */
const VALID_DB_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Safely build an ATTACH DATABASE query with proper escaping
 *
 * Note: CORS proxy wrapping is disabled by default. Use the retry mechanism
 * in query-with-cors-retry.ts which automatically handles CORS errors.
 *
 * @param filePath - The file path or URL to attach
 * @param dbName - The database alias name
 * @param options - Additional options for the ATTACH statement
 * @returns A properly escaped SQL query string
 */
interface AttachOptions {
  readOnly?: boolean;
  useCorsProxy?: boolean;
  secretName?: string;
  attachType?: string;
}

export function buildAttachQuery(filePath: string, dbName: string, options?: AttachOptions): string {
  // Wrap with CORS proxy only if explicitly enabled
  let finalPath = filePath;
  if (options?.useCorsProxy === true && isRemoteUrl(filePath)) {
    // Convert S3 URLs to HTTPS before wrapping with proxy
    // The proxy can't handle s3:// protocol directly
    const httpsUrl = convertS3ToHttps(filePath);
    // Use path-based proxy for database files to allow DuckDB to construct URLs for related files
    finalPath = wrapWithCorsProxyPathBased(httpsUrl || filePath);
  }

  const escapedPath = quote(finalPath, { single: true });
  const escapedDbName = toDuckDBIdentifier(dbName);
  const clauses: string[] = [];
  if (options?.attachType) {
    clauses.push(`TYPE ${options.attachType}`);
  }
  if (options?.secretName) {
    clauses.push(`SECRET ${options.secretName}`);
  }
  if (options?.readOnly) {
    clauses.push('READ_ONLY');
  }

  const clauseSuffix = clauses.length ? ` (${clauses.join(', ')})` : '';

  return `ATTACH ${escapedPath} AS ${escapedDbName}${clauseSuffix}`;
}

/**
 * Safely build a DETACH DATABASE query with proper escaping
 * @param dbName - The database alias name to detach
 * @param ifExists - Whether to use IF EXISTS clause
 * @returns A properly escaped SQL query string
 */
export function buildDetachQuery(dbName: string, ifExists = true): string {
  const escapedDbName = toDuckDBIdentifier(dbName);
  const ifExistsClause = ifExists ? 'IF EXISTS ' : '';

  return `DETACH DATABASE ${ifExistsClause}${escapedDbName}`;
}

/**
 * Safely parses an ATTACH statement and extracts the URL and database name
 * @param statement The SQL statement to parse
 * @returns Object with url and dbName, or null if not a valid ATTACH statement
 */
export function parseAttachStatement(statement: string): { url: string; dbName: string } | null {
  // Basic regex to match ATTACH statements
  // Supports both single-quoted URLs and double-quoted database names
  const attachMatch = statement.match(/ATTACH\s+'([^']+)'\s+AS\s+("[^"]+"|\w+)/i);

  if (!attachMatch) {
    return null;
  }

  const [, url, dbNameRaw] = attachMatch;

  // Validate that the URL is a remote URL (not a local file path)
  if (!isRemoteUrl(url)) {
    return null;
  }

  // Extract and validate the database name
  const dbName =
    dbNameRaw.startsWith('"') && dbNameRaw.endsWith('"')
      ? dbNameRaw.slice(1, -1).replace(/""/g, '"')
      : dbNameRaw;

  // Validate database name format (alphanumeric, underscore, hyphen)
  // This prevents SQL injection through the database name
  if (!isValidDatabaseName(dbName)) {
    console.warn(`Invalid database name format in ATTACH statement: ${dbName}`);
    return null;
  }

  // Additional validation: Check URL scheme is allowed
  const normalizedUrl = url.toLowerCase();
  const hasAllowedScheme = ALLOWED_SCHEMES.some((scheme) => normalizedUrl.startsWith(scheme));

  if (!hasAllowedScheme) {
    console.warn(`Invalid URL scheme in ATTACH statement: ${url}`);
    return null;
  }

  return { url, dbName };
}

/**
 * Validates that a database name is safe to use in SQL queries
 * @param dbName The database name to validate
 * @returns true if the name is safe, false otherwise
 */
export function isValidDatabaseName(dbName: string): boolean {
  // Only allow alphanumeric characters, underscores, and hyphens
  // This prevents SQL injection attacks
  return VALID_DB_NAME_REGEX.test(dbName);
}
