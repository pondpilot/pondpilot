import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ColumnSortSpecList, DBTableOrViewSchema } from '@models/db';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { useState, useEffect, useCallback } from 'react';

import { COMPARISON_RESULTS_ROW_LIMIT } from '../constants/limits';
import { getColumnsToCompare } from '../utils/sql-generator';
import { ComparisonRowStatus } from '../utils/theme';

export interface ComparisonResultRow {
  [key: string]: any;
}

export interface ComparisonResults {
  rows: ComparisonResultRow[];
  schema: DBTableOrViewSchema;
  statusTotals: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    same: number;
  };
  filteredRowCount: number;
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
  statusFilter: ComparisonRowStatus[],
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
      const qualifiedTable = `pondpilot.main.${toDuckDBIdentifier(tableName)}`;
      const allowedStatuses = new Set<ComparisonRowStatus>([
        'added',
        'removed',
        'modified',
        'same',
      ]);
      const sanitizedStatuses = statusFilter.filter((status) => allowedStatuses.has(status));
      const uniqueStatuses = Array.from(new Set(sanitizedStatuses));
      const shouldForceEmpty = statusFilter.length === 0 && sanitizedStatuses.length === 0;
      const applyStatusFilter =
        !shouldForceEmpty &&
        uniqueStatuses.length > 0 &&
        uniqueStatuses.length < allowedStatuses.size;

      const statsSql = `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN _row_status = 'added' THEN 1 ELSE 0 END) AS added,
        SUM(CASE WHEN _row_status = 'removed' THEN 1 ELSE 0 END) AS removed,
        SUM(CASE WHEN _row_status = 'modified' THEN 1 ELSE 0 END) AS modified,
        SUM(CASE WHEN _row_status = 'same' THEN 1 ELSE 0 END) AS same
      FROM ${qualifiedTable}`;

      const statsResult = await pool.query(statsSql);
      const statusTotals = {
        total: Number(statsResult.getChildAt(0)?.get(0) ?? 0),
        added: Number(statsResult.getChildAt(1)?.get(0) ?? 0),
        removed: Number(statsResult.getChildAt(2)?.get(0) ?? 0),
        modified: Number(statsResult.getChildAt(3)?.get(0) ?? 0),
        same: Number(statsResult.getChildAt(4)?.get(0) ?? 0),
      };

      let sql = `SELECT * FROM ${qualifiedTable}`;
      const whereClauses: string[] = [];

      if (shouldForceEmpty) {
        whereClauses.push('1=0');
      } else if (applyStatusFilter) {
        const statusList = uniqueStatuses.map((status) => `'${status}'`).join(', ');
        whereClauses.push(`_row_status IN (${statusList})`);
      }

      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      const allowedColumns = new Set<string>();
      config.joinColumns.forEach((key) => {
        allowedColumns.add(`_key_${key}`);
      });
      const columnsToCompare = getColumnsToCompare(config, schemaComparison);
      columnsToCompare.forEach((columnName) => {
        allowedColumns.add(`${columnName}_a`);
        allowedColumns.add(`${columnName}_b`);
        allowedColumns.add(`${columnName}_status`);
      });
      allowedColumns.add('_row_status');
      allowedColumns.add('_diff_score');

      const sanitizedSort = sort.filter((s) => allowedColumns.has(s.column));

      if (sanitizedSort.length > 0) {
        const orderByClauses = sanitizedSort.map((s) => {
          const direction = s.order ?? 'asc';
          if (s.column === '_row_status') {
            return `(CASE _row_status WHEN 'added' THEN 1 WHEN 'removed' THEN 2 WHEN 'modified' THEN 3 WHEN 'same' THEN 4 ELSE 5 END) ${direction}`;
          }
          return `${toDuckDBIdentifier(s.column)} ${direction}`;
        });
        sql += ` ORDER BY ${orderByClauses.join(', ')}`;
      }

      sql += ` LIMIT ${COMPARISON_RESULTS_ROW_LIMIT}`;

      const result = await pool.query(sql);

      // Extract schema
      const schema = getArrowTableSchema(result);

      // Convert to rows
      const rows = convertArrowTable(result, schema);

      setResults({
        rows,
        schema,
        statusTotals,
        filteredRowCount: rows.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch comparison results:', err);
    } finally {
      setIsLoading(false);
    }
  }, [pool, tableName, config, schemaComparison, executionTime, sort, statusFilter]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  return { results, isLoading, error, refetch: fetchResults };
};
