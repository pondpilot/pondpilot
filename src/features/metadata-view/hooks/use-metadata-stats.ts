import { useDidUpdate } from '@mantine/hooks';
import {
  CancelledOperation,
  ColumnDistribution,
  ColumnStats,
  DataAdapterApi,
  MetadataColumnType,
} from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { isNumberType } from '@utils/db';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Classifies a DB column's normalized SQL type into a metadata column type
 * for use with distribution queries.
 */
export function classifyColumnType(column: DBColumn): MetadataColumnType {
  if (isNumberType(column.sqlType)) {
    return 'numeric';
  }
  switch (column.sqlType) {
    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'date';
    default:
      return 'text';
  }
}

export interface MetadataStatsResult {
  /** Summary stats for all columns, keyed by column name */
  columnStats: Map<string, ColumnStats>;
  /** Distribution data for each column, keyed by column name */
  columnDistributions: Map<string, ColumnDistribution>;
  /** Whether stats are still being fetched */
  isLoading: boolean;
  /** Set of column names whose distributions are still loading */
  loadingDistributions: Set<string>;
  /** Per-column error messages, keyed by column name */
  errors: Map<string, string>;
  /** Whether metadata stats are supported for this data source */
  isSupported: boolean;
}

export interface UseMetadataStatsOptions {
  /** When false, the hook skips data fetching (defaults to true) */
  enabled?: boolean;
}

/**
 * Hook that orchestrates fetching column stats and distributions
 * when the metadata view is active. Follows the useChartData pattern:
 * lazy fetch on view activation, abort on view switch, cache results
 * keyed on dataSourceVersion.
 */
export function useMetadataStats(
  dataAdapter: DataAdapterApi,
  options: UseMetadataStatsOptions = {},
): MetadataStatsResult {
  const { enabled = true } = options;

  const [columnStats, setColumnStats] = useState<Map<string, ColumnStats>>(new Map());
  const [columnDistributions, setColumnDistributions] = useState<Map<string, ColumnDistribution>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDistributions, setLoadingDistributions] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [isSupported, setIsSupported] = useState(true);

  // Destructure stable function references
  const { getColumnStats, getColumnDistribution, currentSchema, isStale, dataSourceVersion } =
    dataAdapter;
  const hasData = currentSchema.length > 0 && !isStale;

  // Cache keyed on dataSourceVersion
  const cache = useRef<{
    version: number;
    stats: Map<string, ColumnStats>;
    distributions: Map<string, ColumnDistribution>;
  } | null>(null);

  // Abort controller ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    if (!enabled || !hasData) {
      setColumnStats(new Map());
      setColumnDistributions(new Map());
      setIsLoading(false);
      setLoadingDistributions(new Set());
      setErrors(new Map());
      return;
    }

    // Check cache
    if (cache.current && cache.current.version === dataSourceVersion) {
      setColumnStats(cache.current.stats);
      setColumnDistributions(cache.current.distributions);
      setIsLoading(false);
      setIsSupported(true);
      return;
    }

    // Abort any previous in-flight requests
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setErrors(new Map());
    setColumnStats(new Map());
    setColumnDistributions(new Map());

    const columnNames = currentSchema.map((col) => col.name);

    // Fetch batch column stats
    let statsMap: Map<string, ColumnStats>;
    try {
      const statsResult = await getColumnStats(columnNames);

      if (controller.signal.aborted) return;

      if (statsResult === undefined) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      setIsSupported(true);
      statsMap = new Map<string, ColumnStats>();
      for (const stat of statsResult) {
        statsMap.set(stat.columnName, stat);
      }
      setColumnStats(statsMap);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof CancelledOperation && err.isSystemCancelled) return;

      const message = err instanceof Error ? err.message : 'Failed to load column stats';
      setErrors(new Map([['__stats__', message]]));
      setIsLoading(false);
      return;
    }

    // Fetch distributions for each column in parallel
    const distributionColumns = currentSchema.map((col) => ({
      name: col.name,
      type: classifyColumnType(col),
    }));

    setLoadingDistributions(new Set(distributionColumns.map((c) => c.name)));

    const newDistributions = new Map<string, ColumnDistribution>();
    const newErrors = new Map<string, string>();

    const distributionPromises = distributionColumns.map(async (col) => {
      try {
        const result = await getColumnDistribution(col.name, col.type);

        if (controller.signal.aborted) return;

        if (result !== undefined) {
          newDistributions.set(col.name, result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof CancelledOperation && err.isSystemCancelled) return;

        newErrors.set(col.name, err instanceof Error ? err.message : 'Failed to load distribution');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDistributions((prev) => {
            const next = new Set(prev);
            next.delete(col.name);
            return next;
          });
        }
      }
    });

    await Promise.all(distributionPromises);

    if (controller.signal.aborted) return;

    setColumnDistributions(newDistributions);
    if (newErrors.size > 0) {
      setErrors((prev) => new Map([...prev, ...newErrors]));
    }
    setIsLoading(false);

    // Update cache with the fetched data
    cache.current = {
      version: dataSourceVersion,
      stats: statsMap,
      distributions: newDistributions,
    };
  }, [
    enabled,
    hasData,
    currentSchema,
    dataSourceVersion,
    getColumnStats,
    getColumnDistribution,
  ]);

  // Trigger fetch when dependencies change
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Abort in-flight requests when the hook is disabled or unmounts
  useEffect(() => {
    if (!enabled && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [enabled]);

  // Clear cache when data source changes
  useDidUpdate(() => {
    cache.current = null;
  }, [dataSourceVersion]);

  return {
    columnStats,
    columnDistributions,
    isLoading,
    loadingDistributions,
    errors,
    isSupported,
  };
}
