import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ColumnSortSpecList, DBTableOrViewSchema } from '@models/db';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { useState, useEffect, useCallback } from 'react';

export interface ComparisonResultRow {
  [key: string]: any;
}

export interface ComparisonResults {
  rows: ComparisonResultRow[];
  schema: DBTableOrViewSchema;
  stats: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    same: number;
  };
}

/**
 * Simplified hook to fetch all comparison results from materialized temp table
 */
export const useComparisonResultsSimple = (
  tableName: string | null,
  config: ComparisonConfig | null,
  schemaComparison: SchemaComparisonResult | null,
  executionTime: number | null,
  sort: ColumnSortSpecList,
) => {
  const pool = useInitializedDuckDBConnectionPool();
  const [results, setResults] = useState<ComparisonResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!tableName || !config || !schemaComparison || !executionTime) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build SQL with sorting
      let sql = `SELECT * FROM ${tableName}`;

      if (sort.length > 0) {
        const orderBy = sort
          .map((s) => `${toDuckDBIdentifier(s.column)} ${s.order || 'asc'}`)
          .join(', ');
        sql += ` ORDER BY ${orderBy}`;
      }

      const result = await pool.query(sql);

      // Extract schema
      const schema = getArrowTableSchema(result);

      // Convert to rows
      const rows = convertArrowTable(result, schema);

      // Calculate statistics
      const stats = {
        total: rows.length,
        added: 0,
        removed: 0,
        modified: 0,
        same: 0,
      };

      rows.forEach((row) => {
        const status = (row as any)._row_status as string;
        if (status === 'added') stats.added += 1;
        else if (status === 'removed') stats.removed += 1;
        else if (status === 'modified') stats.modified += 1;
        else if (status === 'same') stats.same += 1;
      });

      setResults({
        rows,
        schema,
        stats,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch comparison results:', err);
    } finally {
      setIsLoading(false);
    }
  }, [pool, tableName, config, schemaComparison, executionTime, sort]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  return { results, isLoading, error, refetch: fetchResults };
};
