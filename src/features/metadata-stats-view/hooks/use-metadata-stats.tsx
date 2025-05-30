import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { DataAdapterApi } from '@models/data-adapter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MAX_SAMPLE_ROWS } from '../constants';
import { ColumnMetadata, TableMetadata } from '../model';
import { useAsyncProcessing } from './use-async-processing';
import { useStatsCalculations } from './use-stats-calculations';
import { calculateOptimalBatchSize, hasComplexColumnTypes } from '../utils/batch-optimization';
import { createUserFriendlyErrorMessage } from '../utils/column-types';
import { useMetadataCache } from '../utils/metadata-cache';

export function useMetadataStats(
  dataAdapter: DataAdapterApi,
  tabId?: string,
  useFullDataset?: boolean,
) {
  const [metadata, setMetadata] = useState<TableMetadata | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const _duckdb = useInitializedDuckDBConnectionPool();

  // Use smaller specialized hooks
  const {
    loading,
    error,
    isMounted,
    isProcessingRef,
    safeSetLoading,
    safeSetError,
    abortController,
  } = useAsyncProcessing();

  const {
    calculateBasicStats,
    calculateFrequencyDistribution,
    calculateHistogram,
    calculateNumericStats,
  } = useStatsCalculations();

  const cache = useMetadataCache();

  // Track dataAdapter to avoid dependency issues
  const dataAdapterRef = useRef(dataAdapter);
  useEffect(() => {
    dataAdapterRef.current = dataAdapter;
  }, [dataAdapter]);

  // Track useFullDataset to avoid dependency issues
  const useFullDatasetRef = useRef(useFullDataset);
  useEffect(() => {
    useFullDatasetRef.current = useFullDataset;
  }, [useFullDataset]);

  const safeSetMetadata = useCallback((value: TableMetadata | null) => {
    if (isMounted.current) setMetadata(value);
  }, []);

  const safeSetProgress = useCallback((value: { current: number; total: number } | null) => {
    if (isMounted.current) setProgress(value);
  }, []);

  // Reset metadata when data source changes
  useEffect(() => {
    if (isMounted.current) {
      setMetadata(null);
      setProgress(null);
    }
  }, [dataAdapter.dataSourceVersion]);

  // Reset metadata when switching between sample and full dataset modes
  const previousUseFullDataset = useRef(useFullDataset);
  useEffect(() => {
    if (previousUseFullDataset.current !== useFullDataset) {
      previousUseFullDataset.current = useFullDataset;
      setMetadata(null);
      setProgress(null);
    }
  }, [useFullDataset]);

  const processColumnBatch = useCallback(
    async (
      columns: any[],
      allData: any[],
      batchStart: number,
      batchEnd: number,
    ): Promise<ColumnMetadata[]> => {
      const batchResults: ColumnMetadata[] = [];

      for (let j = batchStart; j < batchEnd && j < columns.length; j += 1) {
        const column = columns[j];

        try {
          // Calculate basic statistics
          const basicStats = calculateBasicStats(allData, column.id, column.sqlType);

          // Calculate frequency distribution for all columns
          const frequencyDistribution = calculateFrequencyDistribution(allData, column.id);

          // For numeric columns, calculate additional statistics
          let numericStats = {};
          let histogram: { bin: number; frequency: number }[] = [];

          if (basicStats.numericValues && basicStats.numericValues.length > 0) {
            numericStats = calculateNumericStats(basicStats.numericValues);
            histogram = calculateHistogram(basicStats.numericValues);
          }

          const columnMetadata: ColumnMetadata = {
            name: column.name,
            type: column.sqlType,
            distinctCount: basicStats.distinctCount,
            nonNullCount: basicStats.nonNullCount,
            frequencyDistribution,
            histogram,
            ...numericStats,
          };

          batchResults.push(columnMetadata);
        } catch (columnError) {
          console.warn(`Error processing column ${column.name}:`, columnError);
          // Add a basic metadata entry with error information when processing fails
          const errorMessage =
            columnError instanceof Error
              ? columnError.message
              : 'Unknown error during column processing';

          batchResults.push({
            name: column.name,
            type: column.sqlType,
            distinctCount: 0,
            nonNullCount: 0,
            frequencyDistribution: {},
            histogram: [],
            error: errorMessage,
          });
        }
      }

      return batchResults;
    },
    [
      calculateBasicStats,
      calculateFrequencyDistribution,
      calculateHistogram,
      calculateNumericStats,
    ],
  );

  const fetchMetadata = useCallback(async () => {
    const adapter = dataAdapterRef.current;

    if (!adapter || !_duckdb || adapter.isStale) {
      return;
    }

    if (isProcessingRef.current) {
      return; // Already processing
    }

    // Check cache first - create unique key per tab and data source
    const baseDataSourceId = tabId ? `tab-${tabId}` : `adapter-${adapter.dataSourceVersion}`;
    const dataSourceId = useFullDatasetRef.current ? `${baseDataSourceId}-full` : baseDataSourceId;
    const dataSourceVersion = adapter.dataSourceVersion.toString();
    const cachedMetadata = cache.get(dataSourceId, dataSourceVersion);

    if (cachedMetadata) {
      safeSetMetadata(cachedMetadata);
      return;
    }

    isProcessingRef.current = true;
    safeSetLoading(true);
    safeSetError(null);

    try {
      const tableName = 'Query Result';
      const _estimatedRowCount = adapter.rowCountInfo?.estimatedRowCount || 0;
      const columns = adapter.currentSchema || [];

      if (columns.length === 0) {
        safeSetMetadata({
          tableName,
          rowCount: 0,
          columns: [],
        });
        isProcessingRef.current = false;
        safeSetLoading(false);
        return;
      }

      // Fetch data for metadata calculation - either sample or full dataset
      let allData: any[];
      let actualRowCount: number;

      if (useFullDatasetRef.current) {
        // Use getAllTableData for full dataset
        try {
          const fullDataTable = await adapter.getAllTableData(null);
          allData = fullDataTable;
          actualRowCount = fullDataTable.length;
        } catch (getAllDataError) {
          console.warn('Failed to get full dataset, falling back to sample:', getAllDataError);
          // Fallback to sample if getAllTableData fails
          const dataSlice = adapter.getDataTableSlice(0, MAX_SAMPLE_ROWS);
          if (!dataSlice) throw new Error('Failed to fetch sample data as fallback');
          allData = dataSlice.data;
          actualRowCount = dataSlice.data.length;
        }
      } else {
        // Use getDataTableSlice for sample
        const dataSlice = adapter.getDataTableSlice(0, MAX_SAMPLE_ROWS);
        if (!dataSlice) throw new Error('Failed to fetch sample data');
        allData = dataSlice.data;
        actualRowCount = dataSlice.data.length;
      }

      if (!allData || allData.length === 0 || abortController.getSignal().aborted) {
        if (isMounted.current && !abortController.getSignal().aborted) {
          safeSetMetadata({
            tableName,
            rowCount: 0,
            columns: [],
          });
        }
        isProcessingRef.current = false;
        safeSetLoading(false);
        return;
      }
      const columnMetadata: ColumnMetadata[] = [];

      // Calculate optimal batch size based on data complexity
      const dataComplexity = hasComplexColumnTypes(columns);
      const batchSize = calculateOptimalBatchSize(columns.length, allData.length, dataComplexity);

      // Process columns in batches to avoid blocking UI
      for (let i = 0; i < columns.length; i += batchSize) {
        if (abortController.getSignal().aborted || !isMounted.current) {
          isProcessingRef.current = false;
          safeSetLoading(false);
          safeSetProgress(null);
          return;
        }

        // Update progress
        const current = Math.min(i + batchSize, columns.length);
        safeSetProgress({ current, total: columns.length });

        const batchEnd = Math.min(i + batchSize, columns.length);
        const batchResults = await processColumnBatch(columns, allData, i, batchEnd);
        columnMetadata.push(...batchResults);

        // Allow other tasks to run
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (abortController.getSignal().aborted || !isMounted.current) {
        isProcessingRef.current = false;
        safeSetLoading(false);
        safeSetProgress(null);
        return;
      }

      const finalMetadata: TableMetadata = {
        tableName,
        rowCount: useFullDatasetRef.current
          ? actualRowCount // For full dataset, use actual count from getAllTableData
          : adapter.rowCountInfo?.realRowCount ||
            adapter.rowCountInfo?.estimatedRowCount ||
            actualRowCount,
        sampleRowCount: useFullDatasetRef.current ? undefined : actualRowCount,
        isFullDataset: useFullDatasetRef.current,
        columns: columnMetadata,
      };

      // Cache the result for future use
      cache.set(dataSourceId, dataSourceVersion, finalMetadata);

      safeSetMetadata(finalMetadata);
      safeSetProgress(null); // Clear progress when done
    } catch (err) {
      const friendlyError = createUserFriendlyErrorMessage(err as Error);
      safeSetError(new Error(friendlyError));
    } finally {
      isProcessingRef.current = false;
      safeSetLoading(false);
      safeSetProgress(null);
    }
  }, [_duckdb, cache, tabId]);

  // Return memoized stable references
  return useMemo(
    () => ({
      loading,
      error,
      metadata,
      progress,
      fetchMetadata,
    }),
    [loading, error, metadata, progress, fetchMetadata],
  );
}
