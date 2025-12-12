import { ChartConfig } from '@models/chart';
import {
  CancelledOperation,
  ChartAggregatedData,
  ChartSortOrder,
  DataAdapterApi,
} from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MAX_CHART_DATA_POINTS } from '../constants';
import {
  suggestChartColumns,
  getXAxisCandidates,
  getYAxisCandidates,
  getGroupByCandidates,
} from '../utils';

/**
 * A single data point for Recharts.
 * The 'name' field is used for the X-axis label.
 * Other fields are numeric values for the Y-axis.
 */
export type ChartDataPoint = {
  name: string;
  [key: string]: string | number;
};

/**
 * Pie chart data point structure.
 */
export type PieChartDataPoint = {
  name: string;
  value: number;
};

export interface UseChartDataResult {
  chartData: ChartDataPoint[];
  pieChartData: PieChartDataPoint[];
  isLoading: boolean;
  error: string | null;
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  suggestedConfig: Partial<ChartConfig>;
  /** Whether chart aggregation is supported for this data source */
  isSupported: boolean;
}

/**
 * Maximum number of pie chart slices before grouping into "Other"
 */
const MAX_PIE_SLICES = 10;

/**
 * Minimum percentage for a pie slice to be shown individually (below this goes to "Other")
 */
const MIN_PIE_SLICE_PERCENT = 0.02;

export interface UseChartDataOptions {
  /** When false, the hook skips data fetching (defaults to true) */
  enabled?: boolean;
}

/**
 * Hook that retrieves aggregated chart data from the DataAdapterApi.
 * Data is aggregated server-side using SQL GROUP BY queries.
 */
export function useChartData(
  dataAdapter: DataAdapterApi,
  chartConfig: ChartConfig,
  options: UseChartDataOptions = {},
): UseChartDataResult {
  const { enabled = true } = options;

  const [aggregatedData, setAggregatedData] = useState<ChartAggregatedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Destructure to get stable function reference (from useCallback in use-data-adapter)
  // Using the whole dataAdapter object in dependencies causes re-renders to recreate callbacks
  const { getChartAggregatedData, currentSchema, isStale, dataVersion } = dataAdapter;
  const hasData = currentSchema.length > 0 && !isStale;

  // Compute column candidates for the config UI
  const xAxisCandidates = useMemo(() => getXAxisCandidates(currentSchema), [currentSchema]);
  const yAxisCandidates = useMemo(() => getYAxisCandidates(currentSchema), [currentSchema]);
  const groupByCandidates = useMemo(() => getGroupByCandidates(currentSchema), [currentSchema]);

  // Auto-suggest columns when schema changes
  const suggestedConfig = useMemo(() => {
    if (currentSchema.length === 0) {
      return {};
    }
    return suggestChartColumns(currentSchema);
  }, [currentSchema]);

  const { xAxisColumn, yAxisColumn, groupByColumn, aggregation, sortBy, sortOrder } = chartConfig;

  // Convert chart sort order to API format
  const apiSortOrder: ChartSortOrder | null = sortOrder === 'none' ? null : sortOrder;

  // Fetch aggregated data when config or data version changes
  const fetchData = useCallback(async () => {
    if (!enabled || !hasData) {
      setAggregatedData(null);
      return;
    }

    // Need valid column selection to fetch data
    if (!xAxisColumn || !yAxisColumn) {
      setAggregatedData(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getChartAggregatedData(
        xAxisColumn,
        yAxisColumn,
        aggregation,
        groupByColumn,
        sortBy,
        apiSortOrder,
      );

      if (result === undefined) {
        // Chart aggregation not supported for this data source (e.g., EXPLAIN queries)
        setIsSupported(false);
        setAggregatedData(null);
        setError('Charts are not available for this query type');
      } else if (result.length > MAX_CHART_DATA_POINTS) {
        // Prevent rendering extremely large datasets that could cause performance issues
        setIsSupported(true);
        setAggregatedData(null);
        setError(
          `Dataset too large for visualization (${result.length.toLocaleString()} data points). ` +
            `Maximum supported is ${MAX_CHART_DATA_POINTS.toLocaleString()}. ` +
            'Try adding filters or using GROUP BY to reduce the data size.',
        );
      } else {
        setIsSupported(true);
        setAggregatedData(result);
      }
    } catch (err) {
      if (err instanceof CancelledOperation && err.isSystemCancelled) {
        return;
      }
      let message = err instanceof Error ? err.message : 'Failed to load chart data';
      // Provide a more helpful error message for DuckDB OOM errors
      if (message.includes('Out of Memory Error')) {
        message =
          'Query processing ran out of memory. Try simplifying your query or reducing the amount of data being aggregated.';
      }
      setError(message);
      setAggregatedData(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    getChartAggregatedData,
    hasData,
    enabled,
    xAxisColumn,
    yAxisColumn,
    aggregation,
    groupByColumn,
    sortBy,
    apiSortOrder,
  ]);

  // Fetch data when config or data version changes
  useEffect(() => {
    fetchData();
  }, [fetchData, dataVersion]);

  // Transform aggregated data into Recharts format
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!aggregatedData || aggregatedData.length === 0 || !yAxisColumn) {
      return [];
    }

    if (groupByColumn) {
      // With group by: need to pivot data so each group becomes a key
      const grouped = new Map<string, ChartDataPoint>();

      for (const point of aggregatedData) {
        if (!grouped.has(point.x)) {
          grouped.set(point.x, { name: point.x });
        }
        const chartPoint = grouped.get(point.x)!;
        const groupKey = point.group ?? yAxisColumn;
        chartPoint[groupKey] = point.y;
      }

      return Array.from(grouped.values());
    }
    // Without group by: simple mapping
    return aggregatedData.map((point) => ({
      name: point.x,
      [yAxisColumn]: point.y,
    }));
  }, [aggregatedData, yAxisColumn, groupByColumn]);

  // Transform data for pie charts (group small slices into "Other")
  const pieChartData = useMemo((): PieChartDataPoint[] => {
    if (!aggregatedData || aggregatedData.length === 0) {
      return [];
    }

    // For pie charts, ignore groupBy - just use x and y
    let result: PieChartDataPoint[] = aggregatedData.map((point) => ({
      name: point.x,
      value: point.y,
    }));

    // Sort by value descending to identify small slices
    result.sort((a, b) => b.value - a.value);

    // Calculate total for percentage calculation
    const total = result.reduce((sum, item) => sum + item.value, 0);

    if (total > 0 && result.length > MAX_PIE_SLICES) {
      // Group small slices into "Other"
      const mainSlices: PieChartDataPoint[] = [];
      let otherValue = 0;

      for (let i = 0; i < result.length; i += 1) {
        const slice = result[i];
        const percent = slice.value / total;

        if (i < MAX_PIE_SLICES - 1 && percent >= MIN_PIE_SLICE_PERCENT) {
          mainSlices.push(slice);
        } else {
          otherValue += slice.value;
        }
      }

      if (otherValue > 0) {
        mainSlices.push({ name: 'Other', value: otherValue });
      }

      result = mainSlices;
    }

    // Apply final sort order if specified (re-sort after grouping)
    if (sortOrder === 'asc') {
      result.sort((a, b) => a.value - b.value);
    } else if (sortOrder === 'desc') {
      result.sort((a, b) => b.value - a.value);
    }

    return result;
  }, [aggregatedData, sortOrder]);

  return {
    chartData,
    pieChartData,
    isLoading,
    error,
    xAxisCandidates,
    yAxisCandidates,
    groupByCandidates,
    suggestedConfig,
    isSupported,
  };
}
