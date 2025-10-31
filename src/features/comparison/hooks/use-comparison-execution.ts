import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonId } from '@models/comparison';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { getComparisonResultsTableName } from '@utils/comparison';
import { useState, useCallback } from 'react';

import { generateComparisonSQL, validateComparisonConfig } from '../utils/sql-generator';

/**
 * Hook to execute comparison queries
 */
export const useComparisonExecution = (pool: AsyncDuckDBConnectionPool) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSQL, setGeneratedSQL] = useState<string | null>(null);

  const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

  const executeComparison = useCallback(
    async (
      comparisonId: ComparisonId,
      config: ComparisonConfig,
      schemaComparison: SchemaComparisonResult,
    ) => {
      setIsExecuting(true);
      setError(null);
      const startTime = performance.now();

      try {
        // Validate configuration
        const validationError = validateComparisonConfig(config, schemaComparison);
        if (validationError) {
          setError(validationError);
          return null;
        }

        const createdAt = new Date();
        // Generate table name for materialized results
        const tableName = getComparisonResultsTableName(comparisonId, config, createdAt);

        // Generate SQL to materialize results into a persistent table in the system database
        const sql = generateComparisonSQL(config, schemaComparison, {
          materialize: true,
          tableName,
        });
        setGeneratedSQL(sql);

        // Execute query to create the table
        await pool.query(sql);

        const { comparisons } = useAppStore.getState();
        const existingComparison = comparisons.get(comparisonId);
        const previousTableName = existingComparison?.resultsTableName ?? null;

        if (previousTableName && previousTableName !== tableName) {
          const dropSql = `DROP TABLE IF EXISTS pondpilot.main.${quoteIdentifier(previousTableName)}`;
          await pool.query(dropSql);
        }

        const endTime = performance.now();
        const durationSeconds = (endTime - startTime) / 1000;

        return { tableName, durationSeconds };
      } catch (err) {
        let message = err instanceof Error ? err.message : 'Unknown error';

        // Provide more helpful error messages for common issues
        if (message.includes('does not exist') || message.includes('not found')) {
          message = `Table or view not found: ${message}. The data source may have been deleted or the database may have been closed.`;
        } else if (message.includes('Syntax') || message.includes('Parser Error')) {
          message = `SQL syntax error: ${message}. Please check your filter expressions.`;
        } else if (message.includes('Binder Error')) {
          message = `Column reference error: ${message}. This usually means a column was renamed or removed from the source.`;
        }

        setError(message);
        console.error('Comparison execution failed:', err);
        return null;
      } finally {
        setIsExecuting(false);
      }
    },
    [pool],
  );

  return { executeComparison, isExecuting, error, generatedSQL };
};
