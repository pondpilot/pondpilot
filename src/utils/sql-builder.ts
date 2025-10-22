import { wrapWithCorsProxy, isRemoteUrl } from '@utils/cors-proxy-config';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

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
export function buildAttachQuery(
  filePath: string,
  dbName: string,
  options?: { readOnly?: boolean; useCorsProxy?: boolean },
): string {
  // Wrap with CORS proxy only if explicitly enabled
  let finalPath = filePath;
  if (options?.useCorsProxy === true && isRemoteUrl(filePath)) {
    finalPath = wrapWithCorsProxy(filePath);
  }

  const escapedPath = quote(finalPath, { single: true });
  const escapedDbName = toDuckDBIdentifier(dbName);
  const readOnlyClause = options?.readOnly ? ' (READ_ONLY)' : '';

  return `ATTACH ${escapedPath} AS ${escapedDbName}${readOnlyClause}`;
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
 * Safely build a DROP VIEW query with proper escaping
 * @param viewName - The view name to drop
 * @param ifExists - Whether to use IF EXISTS clause
 * @returns A properly escaped SQL query string
 */
export function buildDropViewQuery(viewName: string, ifExists = true): string {
  const escapedViewName = toDuckDBIdentifier(viewName);
  const ifExistsClause = ifExists ? 'IF EXISTS ' : '';

  return `DROP VIEW ${ifExistsClause}${escapedViewName}`;
}

/**
 * Safely build a CREATE VIEW query with proper escaping
 * @param viewName - The view name to create
 * @param selectQuery - The SELECT query for the view
 * @param replace - Whether to use CREATE OR REPLACE
 * @returns A properly escaped SQL query string
 */
export function buildCreateViewQuery(
  viewName: string,
  selectQuery: string,
  replace = true,
): string {
  const escapedViewName = toDuckDBIdentifier(viewName);
  const createClause = replace ? 'CREATE OR REPLACE VIEW' : 'CREATE VIEW';

  return `${createClause} ${escapedViewName} AS ${selectQuery}`;
}
