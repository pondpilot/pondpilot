import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import { useState, useEffect } from 'react';

export interface ComparisonResultRow {
  [key: string]: any;
}

export interface ComparisonResults {
  rows: ComparisonResultRow[];
  columns: string[];
  statusColumns: string[];
  keyColumns: string[];
  stats: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    same: number;
  };
}

/**
 * Hook to fetch and process comparison results from materialized temp table
 */
export const useComparisonResults = (
  pool: AsyncDuckDBConnectionPool,
  config: ComparisonConfig | null,
  schemaComparison: SchemaComparisonResult | null,
  tableName: string | null,
  executionTime: number | null,
) => {
  const [results, setResults] = useState<ComparisonResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config || !schemaComparison || !tableName || !executionTime) {
      setResults(null);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Query the materialized temp table
        const sql = `SELECT * FROM ${tableName}`;
        const result = await pool.query(sql);

        // Extract column names
        const allColumns = result.schema.fields.map((f) => f.name);
        const keyColumns = config.joinColumns.map((k) => `_key_${k}`);
        const statusColumns = allColumns.filter((c) => c.endsWith('_status'));

        // Convert Arrow table to rows
        const rows: ComparisonResultRow[] = [];
        for (let i = 0; i < result.numRows; i += 1) {
          const row: ComparisonResultRow = {};
          allColumns.forEach((colName) => {
            const col = result.getChild(colName);
            if (col) {
              row[colName] = col.get(i);
            }
          });
          rows.push(row);
        }

        // Calculate statistics
        const rowStatusCol = result.getChild('_row_status');
        const stats = {
          total: result.numRows,
          added: 0,
          removed: 0,
          modified: 0,
          same: 0,
        };

        if (rowStatusCol) {
          for (let i = 0; i < result.numRows; i += 1) {
            const status = rowStatusCol.get(i);
            if (status === 'added') stats.added += 1;
            else if (status === 'removed') stats.removed += 1;
            else if (status === 'modified') stats.modified += 1;
            else if (status === 'same') stats.same += 1;
          }
        }

        setResults({
          rows,
          columns: allColumns,
          statusColumns,
          keyColumns,
          stats,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Failed to fetch comparison results:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [pool, config, schemaComparison, tableName, executionTime]);

  return { results, isLoading, error };
};
