import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonSource } from '@models/tab';
import { useEffect, useState } from 'react';

import { buildSourceSQL } from '../utils/sql-generator';

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

interface ValidationResult {
  state: ValidationState;
  error: string | null;
}

interface FilterValidationContext {
  source: ComparisonSource;
  label?: string;
}

/**
 * Hook to validate SQL filter syntax with debouncing
 *
 * Tests if a WHERE clause is valid by constructing a test query with EXPLAIN.
 * Uses EXPLAIN to validate syntax without executing or accessing actual data,
 * which is safer and more performant than executing the filter.
 */
export const useFilterValidation = (
  pool: AsyncDuckDBConnectionPool,
  filterText: string,
  contexts: FilterValidationContext[] = [],
  debounceMs = 500,
): ValidationResult => {
  const [state, setState] = useState<ValidationState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset if filter is empty
    if (!filterText || filterText.trim().length === 0) {
      setState('idle');
      setError(null);
      return;
    }

    if (contexts.length === 0) {
      setState('idle');
      setError(null);
      return;
    }

    // Set validating state immediately
    setState('validating');

    let cancelled = false;

    const runValidation = async () => {
      for (const context of contexts) {
        try {
          const testQuery = `
            EXPLAIN
            SELECT *
            FROM ${buildSourceSQL(context.source)}
            WHERE ${filterText}
            LIMIT 0
          `.trim();

          await pool.query(testQuery);
        } catch (err) {
          if (cancelled) {
            return;
          }

          const errorMessage = err instanceof Error ? err.message : 'Invalid SQL syntax';
          const cleanError = errorMessage
            .replace(/LINE \d+:\s*/g, '')
            .replace(/\s+LIMIT 0[\s\S]*$/, '')
            .replace(/EXPLAIN\s+/gi, '')
            .trim();

          setState('invalid');
          setError(context.label ? `${context.label}: ${cleanError}` : cleanError);
          return;
        }
      }

      if (!cancelled) {
        setState('valid');
        setError(null);
      }
    };

    const timeoutId = setTimeout(() => {
      runValidation();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pool, filterText, contexts, debounceMs]);

  return { state, error };
};
