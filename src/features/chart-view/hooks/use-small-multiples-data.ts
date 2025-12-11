import { ChartConfig } from '@models/chart';
import {
  CancelledOperation,
  ChartAggregatedData,
  ChartSortOrder,
  DataAdapterApi,
} from '@models/data-adapter';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChartDataPoint } from './use-chart-data';

/**
 * Data for a single chart in the small multiples view.
 */
export type SmallMultipleData = {
  yColumn: string;
  data: ChartDataPoint[];
  isLoading: boolean;
  error: string | null;
};

export interface UseSmallMultiplesDataResult {
  /** Data for each Y column (primary + additional) */
  multiplesData: SmallMultipleData[];
  /** Whether any chart is still loading */
  isLoading: boolean;
  /** Whether small multiples mode is active */
  isSmallMultiplesMode: boolean;
}

/**
 * Hook that fetches aggregated data for multiple Y columns to render small multiples.
 * Each Y column gets its own chart with independent Y scale but shared X axis.
 */
export function useSmallMultiplesData(
  dataAdapter: DataAdapterApi,
  chartConfig: ChartConfig,
): UseSmallMultiplesDataResult {
  const [dataMap, setDataMap] = useState<Map<string, ChartAggregatedData | null>>(new Map());
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = useState<Map<string, string>>(new Map());

  const columns = dataAdapter.currentSchema;
  const hasData = columns.length > 0 && !dataAdapter.isStale;

  const { xAxisColumn, yAxisColumn, additionalYColumns, aggregation, sortBy, sortOrder } =
    chartConfig;

  // All Y columns to fetch (primary + additional)
  const allYColumns = useMemo(() => {
    if (!yAxisColumn) return [];
    return [yAxisColumn, ...additionalYColumns];
  }, [yAxisColumn, additionalYColumns]);

  const isSmallMultiplesMode = additionalYColumns.length > 0;

  // Convert chart sort order to API format
  const apiSortOrder: ChartSortOrder | null = sortOrder === 'none' ? null : sortOrder;

  // Fetch data for a single Y column
  const fetchColumnData = useCallback(
    async (yCol: string, isCancelled?: () => boolean) => {
      if (!hasData || !xAxisColumn) {
        return;
      }

      setLoadingSet((prev) => new Set(prev).add(yCol));
      setErrorMap((prev) => {
        const next = new Map(prev);
        next.delete(yCol);
        return next;
      });

      try {
        // Small multiples don't use groupBy - each chart shows one metric
        const result = await dataAdapter.getChartAggregatedData(
          xAxisColumn,
          yCol,
          aggregation,
          null, // No groupBy for small multiples
          sortBy,
          apiSortOrder,
        );

        if (isCancelled?.()) {
          return;
        }

        if (result === undefined) {
          setErrorMap((prev) =>
            new Map(prev).set(yCol, 'Charts not available for this query type'),
          );
          setDataMap((prev) => {
            const next = new Map(prev);
            next.delete(yCol);
            return next;
          });
        } else {
          setDataMap((prev) => new Map(prev).set(yCol, result));
        }
      } catch (err) {
        if (err instanceof CancelledOperation && err.isSystemCancelled) {
          return;
        }

        if (isCancelled?.()) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to load chart data';
        setErrorMap((prev) => new Map(prev).set(yCol, message));
        setDataMap((prev) => {
          const next = new Map(prev);
          next.delete(yCol);
          return next;
        });
      } finally {
        if (!isCancelled?.()) {
          setLoadingSet((prev) => {
            const next = new Set(prev);
            next.delete(yCol);
            return next;
          });
        }
      }
    },
    [dataAdapter, hasData, xAxisColumn, aggregation, sortBy, apiSortOrder],
  );

  // Fetch all columns when config changes
  useEffect(() => {
    if (!isSmallMultiplesMode) {
      // Clear data when not in small multiples mode
      setDataMap(new Map());
      setLoadingSet(new Set());
      setErrorMap(new Map());
      return;
    }

    if (!hasData || !xAxisColumn) {
      // Clear data when not in small multiples mode
      setDataMap(new Map());
      setLoadingSet(new Set());
      setErrorMap(new Map());
      return;
    }

    // Optimistically mark all columns as loading so UI shows loaders instead of "No data"
    setLoadingSet(new Set(allYColumns));

    let isCancelled = false;

    const fetchSequentially = async () => {
      for (const yCol of allYColumns) {
        if (isCancelled) {
          break;
        }
        // Sequentially await each fetch to avoid adapter-level cancellation of previous requests
        // (DataAdapter aborts the prior aggregation whenever a new one is issued).
        await fetchColumnData(yCol, () => isCancelled);
      }
    };

    fetchSequentially();

    // Clean up stale columns that are no longer in the list
    setDataMap((prev) => {
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (!allYColumns.includes(key)) {
          next.delete(key);
        }
      }
      return next;
    });

    return () => {
      isCancelled = true;
    };
  }, [
    allYColumns,
    isSmallMultiplesMode,
    fetchColumnData,
    dataAdapter.dataVersion,
    hasData,
    xAxisColumn,
  ]);

  // Transform aggregated data into Recharts format for each column
  const multiplesData = useMemo((): SmallMultipleData[] => {
    if (!isSmallMultiplesMode) {
      return [];
    }

    return allYColumns.map((yCol) => {
      const aggregatedData = dataMap.get(yCol);
      const isLoading = loadingSet.has(yCol);
      const error = errorMap.get(yCol) ?? null;

      if (!aggregatedData || aggregatedData.length === 0) {
        return {
          yColumn: yCol,
          data: [],
          isLoading,
          error,
        };
      }

      // Transform to ChartDataPoint format
      const chartData: ChartDataPoint[] = aggregatedData.map((point) => ({
        name: point.x,
        [yCol]: point.y,
      }));

      return {
        yColumn: yCol,
        data: chartData,
        isLoading,
        error,
      };
    });
  }, [allYColumns, dataMap, loadingSet, errorMap, isSmallMultiplesMode]);

  const isLoading = loadingSet.size > 0;

  return {
    multiplesData,
    isLoading,
    isSmallMultiplesMode,
  };
}
