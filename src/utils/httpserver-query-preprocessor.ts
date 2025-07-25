/* eslint-disable no-console */
/**
 * HTTPServer Query Preprocessor
 *
 * Automatically creates HTTPServerDB views when user references HTTPServer database tables
 * directly by database name (e.g., remo.main.table), enabling transparent querying.
 */

import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';

import { createHTTPServerView, generateHTTPServerViewName } from './httpserver-database';

interface HTTPServerReference {
  fullMatch: string;
  dbName: string;
  schemaName: string;
  tableName: string;
  replacement: string;
}

/**
 * Extracts HTTPServerDB references from SQL query
 * Pattern: dbName.schemaName.tableName (where dbName is an HTTPServerDB database name)
 */
function extractHTTPServerReferences(
  query: string,
  httpServerDataSources: Array<Extract<AnyDataSource, { type: 'httpserver-db' }>>,
): HTTPServerReference[] {
  const references: HTTPServerReference[] = [];

  // Create regex pattern for each HTTPServerDB database name
  httpServerDataSources.forEach((dataSource) => {
    // Escape the database name for regex
    const escapedDbName = dataSource.dbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pattern: dbName.schema.table (word boundaries to avoid partial matches)
    const pattern = new RegExp(`\\b${escapedDbName}\\.(\\w+)\\.(\\w+)\\b`, 'g');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query)) !== null) {
      const [fullMatch, schemaName, tableName] = match;

      references.push({
        fullMatch,
        dbName: dataSource.dbName,
        schemaName,
        tableName,
        replacement: '', // Will be filled later with actual view name
      });
    }
  });

  return references;
}

/**
 * Creates HTTPServerDB views for database references and transforms the query
 */
export async function preprocessHTTPServerReferences(
  query: string,
  pool: AsyncDuckDBConnectionPool,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): Promise<string> {
  // Get all HTTPServerDB data sources
  const httpServerDataSources = Array.from(dataSources.values()).filter(
    (dataSource): dataSource is Extract<AnyDataSource, { type: 'httpserver-db' }> =>
      dataSource.type === 'httpserver-db',
  );

  if (httpServerDataSources.length === 0) {
    return query; // No HTTPServerDB connections, return original query
  }

  // Extract HTTPServerDB references from the query
  const references = extractHTTPServerReferences(query, httpServerDataSources);

  if (references.length === 0) {
    return query; // No HTTPServerDB references, return original query
  }

  let processedQuery = query;

  // Process each reference
  for (const ref of references) {
    try {
      // Find the corresponding HTTPServerDB data source
      const httpServerDb = httpServerDataSources.find(
        (dataSource) => dataSource.dbName === ref.dbName,
      );

      if (!httpServerDb) {
        console.warn(`HTTPServerDB with name '${ref.dbName}' not found`);
        continue;
      }

      // Check if HTTPServerDB is connected
      if (httpServerDb.connectionState !== 'connected') {
        console.warn(
          `HTTPServerDB '${ref.dbName}' is not connected (state: ${httpServerDb.connectionState})`,
        );
        continue;
      }

      // Create HTTPServer view for the table
      await createHTTPServerView(pool, httpServerDb, ref.schemaName, ref.tableName);

      // Generate the actual view name using the same logic as other parts of the system
      const viewName = generateHTTPServerViewName(httpServerDb, ref.schemaName, ref.tableName);

      // Replace dbName.schema.table with the view name
      processedQuery = processedQuery.replace(
        new RegExp(ref.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        viewName,
      );
    } catch (error) {
      console.error(`Failed to create HTTPServer view for '${ref.fullMatch}':`, error);
      // Continue processing other references even if one fails
    }
  }

  return processedQuery;
}

/**
 * Validates that all HTTPServerDB references in the query can be resolved
 */
export function validateHTTPServerReferences(
  query: string,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): string[] {
  const httpServerDataSources = Array.from(dataSources.values()).filter(
    (dataSource): dataSource is Extract<AnyDataSource, { type: 'httpserver-db' }> =>
      dataSource.type === 'httpserver-db',
  );

  const references = extractHTTPServerReferences(query, httpServerDataSources);
  const errors: string[] = [];

  for (const ref of references) {
    const httpServerDb = httpServerDataSources.find(
      (dataSource) => dataSource.dbName === ref.dbName,
    );

    if (!httpServerDb) {
      // This shouldn't happen since we only extract references for known HTTPServerDB names
      errors.push(`HTTPServerDB '${ref.dbName}' not found for reference '${ref.fullMatch}'`);
      continue;
    }

    if (httpServerDb.connectionState !== 'connected') {
      errors.push(
        `HTTPServerDB '${ref.dbName}' is not connected (state: ${httpServerDb.connectionState})`,
      );
      continue;
    }
  }

  return errors;
}
