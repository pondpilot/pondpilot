import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ConstraintResult } from '@utils/duckdb/models';

import { escapeStringLiteral } from './sql-escape';
import { vectorToArray } from './vector-extraction';

export interface ConstraintInfo {
  primaryKeys: string[];
  foreignKeys: Map<string, { targetTable: string; targetColumn: string }>;
  notNullColumns: string[];
}

/**
 * Fetches constraint information for a table from DuckDB
 *
 * Queries DuckDB's constraint system table to retrieve:
 * - Primary key columns
 * - Foreign key relationships and their targets
 * - NOT NULL constraints
 *
 * @param pool - DuckDB connection pool for executing queries
 * @param database - Database name (typically 'main')
 * @param schema - Schema name (typically 'main')
 * @param table - Table name to get constraints for
 * @returns Promise containing constraint information
 *
 * @example
 * ```ts
 * const constraints = await getTableConstraints(pool, 'main', 'main', 'customers');
 * console.log('Primary keys:', constraints.primaryKeys);
 * console.log('Foreign keys:', constraints.foreignKeys);
 * ```
 */
export async function getTableConstraints(
  pool: AsyncDuckDBConnectionPool,
  database: string,
  schema: string,
  table: string,
  abortSignal?: AbortSignal,
): Promise<ConstraintInfo> {
  // Set up query with timeout (5 seconds for constraint queries)
  const queryPromise = pool.query(`
    SELECT *
    FROM duckdb_constraints()
    WHERE database_name = ${escapeStringLiteral(database)}
      AND schema_name = ${escapeStringLiteral(schema)}
      AND table_name = ${escapeStringLiteral(table)}
  `);

  let constraintsResult;
  if (abortSignal) {
    const timeoutPromise = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Constraint query timeout: Operation took too long'));
      }, 5000); // 5 second timeout for constraint queries

      abortSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Constraint query cancelled'));
      });
    });

    constraintsResult = await Promise.race([queryPromise, timeoutPromise]);
  } else {
    constraintsResult = await queryPromise;
  }

  const primaryKeys: string[] = [];
  const foreignKeys = new Map<string, { targetTable: string; targetColumn: string }>();
  const notNullColumns: string[] = [];

  if (constraintsResult) {
    const constraints = (
      Array.isArray(constraintsResult)
        ? constraintsResult
        : Array.from(constraintsResult as Iterable<ConstraintResult>)
    ) as ConstraintResult[];
    for (const row of constraints) {
      const constraintType = row.constraint_type;
      const constraintColumns = row.constraint_column_names
        ? vectorToArray(row.constraint_column_names)
        : [];

      if (constraintType === 'PRIMARY KEY') {
        primaryKeys.push(...constraintColumns);
      } else if (constraintType === 'FOREIGN KEY' && row.referenced_table) {
        const targetTable = row.referenced_table;
        const targetColumns = row.referenced_column_names
          ? vectorToArray(row.referenced_column_names)
          : [];

        // Map each foreign key column to its target
        constraintColumns.forEach((col, idx) => {
          foreignKeys.set(col, {
            targetTable,
            targetColumn: targetColumns[idx] || targetColumns[0],
          });
        });
      } else if (constraintType === 'NOT NULL') {
        notNullColumns.push(...constraintColumns);
      }
    }
  }

  return {
    primaryKeys,
    foreignKeys,
    notNullColumns,
  };
}
