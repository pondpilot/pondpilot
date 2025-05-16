import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';

import { escapeStringLiteral } from './sql-escape';
import { vectorToArray } from './vector-extraction';

export interface BatchConstraintInfo {
  table: string;
  primaryKeys: string[];
  foreignKeys: Map<string, { targetTable: string; targetColumn: string }>;
  notNullColumns: string[];
}

/**
 * Get constraint information for multiple tables in a single query
 * @param pool - DuckDB connection pool
 * @param database - Database name
 * @param schema - Schema name
 * @param tables - Array of table names
 * @returns Map of table names to their constraint information
 */
export async function getBatchTableConstraints(
  pool: AsyncDuckDBConnectionPool,
  database: string,
  schema: string,
  tables: string[],
  abortSignal?: AbortSignal,
): Promise<Map<string, BatchConstraintInfo>> {
  if (tables.length === 0) {
    return new Map();
  }

  // Set up query with timeout (5 seconds for batch constraint queries)
  const queryPromise = pool.query(`
    SELECT * FROM duckdb_constraints()
    WHERE database_name = ${escapeStringLiteral(database)}
      AND schema_name = ${escapeStringLiteral(schema)}
      AND table_name IN (${tables.map((t) => escapeStringLiteral(t)).join(', ')})
  `);

  let constraintsResult;
  if (abortSignal) {
    const timeoutPromise = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Batch constraint query timeout: Operation took too long'));
      }, 5000); // 5 second timeout for constraint queries

      abortSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Batch constraint query cancelled'));
      });
    });

    constraintsResult = await Promise.race([queryPromise, timeoutPromise]);
  } else {
    constraintsResult = await queryPromise;
  }

  // Group constraints by table
  const constraintsByTable = new Map<string, BatchConstraintInfo>();

  // Initialize empty constraint info for each table
  tables.forEach((table) => {
    constraintsByTable.set(table, {
      table,
      primaryKeys: [],
      foreignKeys: new Map(),
      notNullColumns: [],
    });
  });

  if (constraintsResult) {
    const constraints = Array.isArray(constraintsResult)
      ? constraintsResult
      : Array.from(constraintsResult as Iterable<any>);

    for (const row of constraints) {
      const tableName = row.table_name;
      const constraintInfo = constraintsByTable.get(tableName);

      if (!constraintInfo) continue;

      const constraintType = row.constraint_type;
      const constraintColumns = row.constraint_column_names
        ? vectorToArray(row.constraint_column_names)
        : [];

      if (constraintType === 'PRIMARY KEY') {
        if (constraintColumns.length > 0) {
          constraintInfo.primaryKeys.push(...constraintColumns);
        }
      } else if (constraintType === 'FOREIGN KEY') {
        if (constraintColumns.length > 0) {
          const sourceColumn = constraintColumns[0];

          // Handle referenced table and columns
          const referencedTable = row.referenced_table;
          const referencedColumns = row.referenced_column_names
            ? vectorToArray(row.referenced_column_names)
            : [];

          const targetInfo = {
            targetTable: referencedTable || '',
            targetColumn: referencedColumns[0] || '',
          };
          constraintInfo.foreignKeys.set(sourceColumn, targetInfo);
        }
      } else if (constraintType === 'NOT NULL') {
        if (constraintColumns.length > 0) {
          constraintInfo.notNullColumns.push(...constraintColumns);
        }
      }
    }
  }

  return constraintsByTable;
}
