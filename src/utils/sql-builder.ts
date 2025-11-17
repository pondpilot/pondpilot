import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

// Re-export ATTACH-related functions from the consolidated module
export { buildAttachQuery, buildDetachQuery } from './sql-attach';

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
