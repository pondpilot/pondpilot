import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatMessageQuery } from '@models/ai-chat';
import { useCallback } from 'react';

import { MAX_RESULT_ROWS } from '../utils';

// Wraps a query with LIMIT to prevent loading too much data
function wrapQueryWithLimit(sql: string, limit: number): string {
  // Remove trailing semicolon if present
  const cleanSql = sql.trim().replace(/;\s*$/, '');

  // Check if query already has a LIMIT clause
  const upperSql = cleanSql.toUpperCase();
  const hasLimit = /\bLIMIT\s+\d+/i.test(upperSql);

  if (hasLimit) {
    // Query already has LIMIT, don't modify it
    return sql;
  }

  // For simple SELECT queries, just add LIMIT
  // For complex queries (with ORDER BY, GROUP BY, etc.), wrap in subquery
  if (/\b(ORDER\s+BY|GROUP\s+BY|HAVING|UNION|INTERSECT|EXCEPT)\b/i.test(upperSql)) {
    // Complex query - wrap in subquery
    return `SELECT * FROM (${cleanSql}) AS _limited_results LIMIT ${limit}`;
  }
  // Simple query - just append LIMIT
  return `${cleanSql} LIMIT ${limit}`;
}

export const useQueryExecution = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();

  const executeQuery = useCallback(
    async (sql: string): Promise<ChatMessageQuery> => {
      const startTime = Date.now();

      if (!duckDbConnectionPool) {
        return {
          sql,
          successful: false,
          error: 'Database connection not available',
          executionTime: 0,
        };
      }

      try {
        // First, check if we need to count total rows
        // Wrap the original query in a subquery with LIMIT to avoid loading all data
        const limitedSql = wrapQueryWithLimit(sql, MAX_RESULT_ROWS + 1);

        const result = await duckDbConnectionPool.query(limitedSql);
        const proto = result.toArray();

        // Convert to our format
        const columns = result.schema.fields.map((field: any) => field.name);
        const allRows = proto.map((row: any) => {
          return columns.map((col: string) => row[col]);
        });

        // Check if results were truncated
        const truncated = allRows.length > MAX_RESULT_ROWS;
        const rows = truncated ? allRows.slice(0, MAX_RESULT_ROWS) : allRows;

        const queryResults = {
          columns,
          rows,
          rowCount: rows.length,
          truncated,
        };

        return {
          sql,
          successful: true,
          results: queryResults,
          executionTime: Date.now() - startTime,
        };
      } catch (error) {
        return {
          sql,
          successful: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          executionTime: Date.now() - startTime,
        };
      }
    },
    [duckDbConnectionPool],
  );

  return { executeQuery };
};
