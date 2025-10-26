import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import { useState, useCallback } from 'react';

import { generateComparisonSQL, validateComparisonConfig } from '../utils/sql-generator';

/**
 * Hook to execute comparison queries
 */
export const useComparisonExecution = (pool: AsyncDuckDBConnectionPool) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSQL, setGeneratedSQL] = useState<string | null>(null);

  const executeComparison = useCallback(
    async (config: ComparisonConfig, schemaComparison: SchemaComparisonResult) => {
      setIsExecuting(true);
      setError(null);

      try {
        // Validate configuration
        const validationError = validateComparisonConfig(config);
        if (validationError) {
          setError(validationError);
          return null;
        }

        // Generate SQL
        const sql = generateComparisonSQL(config, schemaComparison);
        setGeneratedSQL(sql);

        // Execute query
        const result = await pool.query(sql);

        return result;
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
