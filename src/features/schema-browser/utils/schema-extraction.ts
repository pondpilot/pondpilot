import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyFlatFileDataSource } from '@models/data-source';
import { DescribeResult } from '@utils/duckdb/types';
import { Node } from 'reactflow';

import { getTableConstraints } from './constraints';
import { escapeIdentifier } from './sql-escape';
import { QUERY_TIMEOUT_DESCRIBE } from '../constants';
import { SchemaNodeData, SchemaColumnData } from '../model';

/**
 * Extracts schema information for a flat file data source
 * @param source - The flat file data source
 * @param pool - DuckDB connection pool
 * @param abortSignal - Optional abort signal for cancellation
 * @param timeout - Query timeout in milliseconds (default 10 seconds)
 * @returns Promise with schema node data or null if extraction fails
 */
export async function extractFlatFileSchema(
  source: AnyFlatFileDataSource,
  pool: AsyncDuckDBConnectionPool,
  abortSignal?: AbortSignal,
  timeout = QUERY_TIMEOUT_DESCRIBE,
): Promise<SchemaNodeData | null> {
  let tableInfoResult;

  try {
    // Query the schema information with timeout
    const pooledConn = await pool.getPooledConnection();
    try {
      // Set up query with timeout
      const queryPromise = pooledConn.query(`
        DESCRIBE ${escapeIdentifier('main')}.${escapeIdentifier(source.viewName)};
      `);

      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Query timeout: Operation took too long'));
        }, timeout);

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('Query cancelled by user'));
          });
        }
      });

      tableInfoResult = await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      await pooledConn.close();
    }

    if (!tableInfoResult) {
      return null;
    }

    // Get constraint information
    const { primaryKeys, foreignKeys, notNullColumns } = await getTableConstraints(
      pool,
      'main',
      'main',
      source.viewName,
      abortSignal,
    );

    const columns: SchemaColumnData[] = (
      Array.isArray(tableInfoResult)
        ? tableInfoResult
        : Array.from(tableInfoResult as Iterable<DescribeResult>)
    ).map((row: DescribeResult) => {
      const columnName = row.column_name;
      return {
        name: columnName,
        sqlType: row.column_type,
        isPrimaryKey: primaryKeys.includes(columnName),
        isForeignKey: foreignKeys.has(columnName),
        isNotNull: notNullColumns.includes(columnName),
        referencesTable: foreignKeys.get(columnName)?.targetTable,
        referencesColumn: foreignKeys.get(columnName)?.targetColumn,
      };
    });

    // Create node data
    const nodeData: SchemaNodeData = {
      id: source.id,
      label: source.viewName,
      type: 'table',
      sourceId: source.id,
      sourceType: 'file',
      columns,
    };

    return nodeData;
  } catch (error) {
    console.error(`Error extracting schema for ${source.viewName}:`, error);
    return null;
  }
}

/**
 * Creates a ReactFlow node from schema node data
 * @param nodeData - The schema node data
 * @param position - Node position
 * @returns ReactFlow node
 */
export function createSchemaNode(
  nodeData: SchemaNodeData,
  position: { x: number; y: number },
): Node<SchemaNodeData> {
  return {
    id: nodeData.id,
    data: nodeData,
    position,
    type: 'tableNode',
  };
}
