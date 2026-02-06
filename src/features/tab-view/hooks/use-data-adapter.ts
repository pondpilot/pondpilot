import { syncFiles } from '@controllers/file-system';
import { updateTabDataViewStaleDataCache } from '@controllers/tab';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBPooledStreamReader } from '@features/duckdb-context/duckdb-pooled-streaming-reader';
import { PoolTimeoutError } from '@features/duckdb-context/timeout-error';
import { useAbortController } from '@hooks/use-abort-controller';
import { useDidUpdate } from '@mantine/hooks';
import {
  CancelledOperation,
  ChartAggregatedData,
  ChartAggregationType,
  ChartSortOrder,
  ColumnAggregateType,
  ColumnDistribution,
  ColumnStats,
  DataAdapterApi,
  GetDataTableSliceReturnType,
  MetadataColumnType,
  RowCountInfo,
} from '@models/data-adapter';
import { ColumnSortSpecList, DataTable, DBColumn, DBTableOrViewSchema } from '@models/db';
import { AnyTab, MAX_PERSISTED_STALE_DATA_ROWS, StaleData, TabReactiveState } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import {
  isSameSchema,
  isStrictSchemaSubset,
  isTheSameSortSpec,
  toggleMultiColumnSort,
} from '@utils/db';
import { isSchemaError } from '@utils/schema-error-detection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDataAdapterQueries } from './use-data-adapter-queries';

// Data adapter is a logic layer between abstract batch streaming data source
// and the UI layer (Table component).
//
// It handles the data fetching, aggregation and caching logic.

type UseDataAdapterProps = {
  tab: TabReactiveState<AnyTab>;
  /**
   * Whenever this changes, adapter will force update internal version,
   * even if the data source appears the same. E.g. tail queries of scripts
   * can match exactly, but should force a new data version.
   */
  sourceVersion: number;
};

export const useDataAdapter = ({ tab, sourceVersion }: UseDataAdapterProps): DataAdapterApi => {
  const pool = useInitializedDuckDBConnectionPool();

  /**
   * Hooks
   */
  const queries = useDataAdapterQueries({ tab, sourceVersion });

  // We use a couple of abort controllers to cancel various queries that this
  // hook may run.

  // The main data fetch abort controller. This is used both for the UI
  // to be able to stop reading data on user request, and also to override
  // current partial fetch with a readAll.
  const { getSignal: getDataFetchAbortSignal, abort: abortDataFetch } = useAbortController();

  // This is for all user initiated side tasks (column summary, export etc.).
  // We use it internally to only run one task at a time.
  const { getSignal: getUserTasksAbortSignal, abort: abortUserTasks } = useAbortController();

  // This is for all background system tasks (currently only row counts).
  const { getSignal: getBackgroundTasksAbortSignal, abort: abortBackgroundTasks } =
    useAbortController();

  /**
   * Store access
   */

  // Using this to cancel all background tasks on tab close
  const activeTabId = useAppStore.use.activeTabId();

  /**
   * Local Reactive State
   */

  // This is used to allow downstream components to subscribe
  // and react to each data change as we fetch/reset data if they need to.
  // This is strictly inreasing number.
  const [dataVersion, setDataVersion] = useState<number>(0);

  // This is used to allow downstream components to subscribe
  // and react only to data source changes, but not to intermediate
  // data changes. Think, every time `mainDataReader` is created
  // or reset, we increment this number.
  // This is strictly inreasing number.
  const [dataSourceVersion, setDataSourceVersion] = useState<number>(0);

  // Actual data schema
  const [actualDataSchema, setActualDataSchema] = useState<DBTableOrViewSchema>([]);

  // Holds stale data when available, either from persistent storage on load,
  // or from previous read when changing the driving source query or sort.
  // We do not need the row counts for stale data in the local state,
  // because we maintain only counts for the actual data. But we re-use
  // persistence model, where we store last known row counts - hence the Omit.
  // Init from cache if available.
  const [staleData, setStaleData] = useState<Omit<
    StaleData,
    'realRowCount' | 'estimatedRowCount'
  > | null>(() => {
    const cachedStaleData =
      useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.staleData || null;

    if (!cachedStaleData) {
      return null;
    }

    return {
      schema: cachedStaleData.schema,
      data: cachedStaleData.data,
      rowOffset: cachedStaleData.rowOffset,
    };
  });

  // When it comes to row counts we have the following possibilities:
  // 1. Exact row count is immediately known from the metadata even before running anything
  //    (e.g. when using a table from a attached db)
  // 2. We can't quickly get precise or estimated row count, but we can do it in backgroud with reasonable performance
  //    (e.g. when using a view from a flat file - we are ok to run `SELECT COUNT(*) FROM ...`)
  // 3. We can't be sure that we can quickly get precise row count (arbitrary user query)
  //    but we can get an estimate (e.g. by reading query plan)
  // 4. We have read the data to the end and we know the row count for sure
  // Init `totalRowCount` from cache if available.
  const [rowCountInfo, setRowCountInfo] = useState<RowCountInfo>(() => {
    const cached = useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.staleData;

    if (cached) {
      return {
        realRowCount: cached.realRowCount,
        estimatedRowCount: cached.estimatedRowCount,
        availableRowCount: cached.data.length + cached.rowOffset,
      };
    }

    return {
      realRowCount: null,
      estimatedRowCount: null,
      availableRowCount: 0,
    };
  });

  // Holds current sorting spec. Init from cache if available.
  const [sort, setSort] = useState<ColumnSortSpecList>(
    () => useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.sort || [],
  );

  // We want to let the users know whether we are fetcing from scratch becase
  // of the sort change or because of the data source change.
  const [lastSort, _setLastSort] = useState<ColumnSortSpecList>(sort);
  /**
   * This is a safe setter for last sort. It will only set the state
   * if the new sort is different from the previous one.
   */
  const setLastSortSafe = useCallback((newSort: ColumnSortSpecList) => {
    _setLastSort((prev) => (isTheSameSortSpec(prev, newSort) ? prev : newSort));
  }, []);

  const [dataSourceExhausted, setDataSourceExhausted] = useState(false);
  const [dataSourceReadError, setDataSourceReadError] = useState<string[]>([]);
  /**
   * Set or append a data source read error. If an error is already present and a new value is set,
   * this function will append the new error to the existing one.
   */
  const setAppendDataSourceReadError = useCallback(
    (error: string) => {
      setDataSourceReadError((prev) => {
        if (prev.includes(error)) {
          // Error already present, do not append
          return prev;
        }
        return [...prev, error];
      });
    },
    [setDataSourceReadError],
  );

  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isCreatingReader, setIsCreatingReader] = useState(false);

  /**
   * Local Non-reactive State
   */

  // Holds the current connection to the database
  const mainDataReaderRef = useRef<AsyncDuckDBPooledStreamReader<any> | null>(null);

  // Holds the data read from the data source. We use ref to allow efficient
  // appends instead of re-writing, what can be a huge array every time.
  const actualData = useRef<DataTable>([]);

  // We need a non-reactive ref to be able to handle multiple
  // parallel fetch calls, such that to the end user it seems that
  // they all resolve whenever their requested amount of data is read,
  // although in reality we only read from one request at a time.
  // This may happen if the user is scrolling quickly and requesting
  // ever increasing amounts of data, quicker than we can read it.
  const fetchTo = useRef<number | null>(0);
  const dataReadCancelled = useRef(false);

  /**
   * Computed State
   */

  const isStale = staleData !== null;
  const currentSchema = isStale ? staleData.schema : actualDataSchema;

  const dataQueriesBuildError = useMemo(() => {
    const buildErrors = queries.userErrors.slice();

    // Log internal errors to the console and add one user facing error
    // to the load errors
    if (queries.internalErrors.length > 0) {
      console.group('Error creating data adapter for tab id:', tab.id);
      queries.internalErrors.forEach((error) => console.error(error));
      console.groupEnd();
      buildErrors.push('Internal error creating data adapter. Please report this issue.');
    }

    return buildErrors;
  }, [queries, tab.id]);

  const dataSourceError = [...dataQueriesBuildError, ...dataSourceReadError];

  // Disable sorting if:
  // - there is no sortable reader (data source is missing or doesn't support sorting)
  // - there is no data available (schema is empty)
  // - there was an error reading data
  const disableSort =
    queries.getSortableReader === undefined ||
    currentSchema.length === 0 ||
    dataSourceError.length > 0;

  /**
   * -------------------------------------------------------------
   * Set wrappers for convenience
   * -------------------------------------------------------------
   */

  /**
   * Ensures we do not set unnecessary state updates and that we
   * consistently go from no real row count to real row count, and not
   * the other way around.
   *
   * Optimizes rendering by only updating when the value is different.
   * Thus it is safe to call this without checking any preconditions.
   */
  const setRealRowCount = useCallback(
    (realRowCount: number) => {
      if (rowCountInfo.realRowCount === realRowCount) {
        // no-op
        return;
      }

      if (rowCountInfo.realRowCount !== null) {
        // probably a bug, but not critical
        console.warn(
          'Unexpectedly setting real row count to a different value than the previous one.',
        );
      }

      setRowCountInfo((prev) => {
        return {
          ...prev,
          realRowCount,
          estimatedRowCount: null,
        };
      });
    },
    [rowCountInfo.realRowCount],
  );

  /**
   * Updates estimated row count.
   *
   * Ensures that we do not set estimated row count if we already have
   * a real row count.
   *
   * Optimizes rendering by only updating when the value is different.
   * Thus it is safe to call this without checking any preconditions.
   */
  const setEstimatedRowCount = useCallback(
    (estimatedRowCount: number) => {
      if (rowCountInfo.estimatedRowCount === estimatedRowCount) {
        // no-op
        return;
      }

      if (rowCountInfo.realRowCount !== null) {
        // probably a bug, but not critical
        console.warn('Tried setting estimated row count while real row count is already set.');
        return;
      }

      setRowCountInfo((prev) => {
        return {
          ...prev,
          estimatedRowCount,
        };
      });
    },
    [rowCountInfo.estimatedRowCount, rowCountInfo.realRowCount],
  );

  /**
   * Updates loaded row count.
   *
   * Optimizes rendering by only updating when the value is different.
   * Thus it is safe to call this without checking any preconditions.
   */
  const setAvailableRowCount = useCallback(
    (availableRowCount: number) => {
      if (rowCountInfo.availableRowCount === availableRowCount) {
        // no-op
        return;
      }

      setRowCountInfo((prev) => {
        return {
          ...prev,
          availableRowCount,
        };
      });
    },
    [rowCountInfo.availableRowCount],
  );

  /**
   * -------------------------------------------------------------
   * Helper functions
   * -------------------------------------------------------------
   */

  const cancelAllDataOperations = useCallback(() => {
    // Cancel any pending fetches, and background tasks
    abortDataFetch();
    abortUserTasks();
    abortBackgroundTasks();
  }, [abortBackgroundTasks, abortDataFetch, abortUserTasks]);

  /**
   * -------------------------------------------------------------
   * Effects & functions related to data source / prop changes
   * -------------------------------------------------------------
   */

  /**
   * Fetches the row count in the background.
   */
  const fetchRowCount = useCallback(async () => {
    // Get new abort signal
    const signal = getBackgroundTasksAbortSignal();

    try {
      if (queries.getRowCount) {
        const { value, aborted } = await queries.getRowCount(signal);

        // It is feasible that we have already got the real count for small
        // table from the first fetch. Our `setRealRowCount` function handles that
        if (!aborted) setRealRowCount(value);
      } else if (queries.getEstimatedRowCount) {
        const { value, aborted } = await queries.getEstimatedRowCount(signal);

        if (!aborted) setEstimatedRowCount(value);
      }
    } catch (error) {
      if (!(error instanceof PoolTimeoutError)) {
        console.error('Failed to fetch row count:', error);
        if (error instanceof Error && error.message?.includes('Out of Memory Error')) {
          setAppendDataSourceReadError(
            'Data source is too large to count rows. Try using a SQL query with specific columns.',
          );
        } else {
          setAppendDataSourceReadError('Failed to fetch row counts');
        }
      }
    }
  }, [
    queries,
    setRealRowCount,
    setEstimatedRowCount,
    setAppendDataSourceReadError,
    getBackgroundTasksAbortSignal,
  ]);

  const getNewReader = useCallback(
    async (newSortParams: ColumnSortSpecList, options = { retry_with_file_sync: true }) => {
      try {
        if (queries.getReader || queries.getSortableReader) {
          // Get the abort signal
          const abortSignal = getDataFetchAbortSignal();

          // set setIsCreatingReader to true
          setIsCreatingReader(true);

          const newReader = queries.getSortableReader
            ? await queries.getSortableReader(newSortParams, abortSignal)
            : await queries.getReader!(abortSignal);

          // Reader will be null if load was aborted, so check it first
          if (newReader !== null) {
            mainDataReaderRef.current = newReader;
            setDataSourceVersion((prev) => prev + 1);

            // Send row count fetching to background if we do not have it already
            if (!rowCountInfo.realRowCount) {
              fetchRowCount();
            }
          }
        }
      } catch (error: any) {
        if (error instanceof PoolTimeoutError) {
          setAppendDataSourceReadError(
            'Too many tabs open or operations running. Please wait and re-open this tab.',
          );
        } else if (error.message?.includes('NotReadableError')) {
          if (options.retry_with_file_sync) {
            await syncFiles(pool);
            await getNewReader(newSortParams, { retry_with_file_sync: false });
          } else {
            console.error('Data source have been moved or deleted:', error);
            setAppendDataSourceReadError('Data source have been moved or deleted.');
          }
        } else if (isSchemaError(error)) {
          if (options.retry_with_file_sync) {
            await syncFiles(pool);
            await reset(newSortParams);
            await getNewReader(newSortParams, { retry_with_file_sync: false });
          } else {
            console.error('Schema mismatch detected:', error);
            setAppendDataSourceReadError('Data source schema has changed. Please refresh the tab.');
          }
        } else if (error.message?.includes('NotFoundError')) {
          console.error('Data source have been moved or deleted:', error);
          setAppendDataSourceReadError('Data source have been moved or deleted.');
        } else if (error.message?.includes('Out of Memory Error')) {
          console.error('Out of memory while reading data source:', error);
          setAppendDataSourceReadError(
            'The data source is too large to process in memory. Try using a SQL query to select specific columns or limit rows.',
          );
        } else {
          console.error('Failed to create a reader for the data source:', error);
          setAppendDataSourceReadError(
            'Failed to create a reader for the data source. See console for technical details.',
          );
        }
      } finally {
        if (queries.getReader || queries.getSortableReader) {
          // We are done fetching data (here at least), so we can set the flag to false
          setIsCreatingReader(false);
        }
      }
    },
    [
      fetchRowCount,
      getDataFetchAbortSignal,
      pool,
      queries,
      rowCountInfo.realRowCount,
      setAppendDataSourceReadError,
    ],
  );

  /**
   * Resets the state by re-creating the reader with given sort params.
   *
   * This is called in two scenarios:
   * 1. When the data source changes (e.g. new query) - `newSortParams` are null
   * 2. When the sort changes - `newSortParams` are, well, the new sort params
   */
  const reset = useCallback(
    async (newSortParams: ColumnSortSpecList | null) => {
      // Reset a bunch of things.

      let lastAvailableRowCount = 0;

      if (staleData === null) {
        // The real data is not needed anymore, we should replace
        // stale data with it.
        lastAvailableRowCount = actualData.current.length;

        setStaleData({
          schema: actualDataSchema.slice(),
          data: actualData.current,
          rowOffset: 0,
        });

        actualData.current = [];
      } else {
        // We are resetting in stale state, so just use the stale data info
        lastAvailableRowCount = staleData.data.length + staleData.rowOffset;
      }

      // Cancel any pending fetches, and background tasks & readers
      cancelAllDataOperations();

      // Cancel the main data reader before creating a new one
      const curReader = mainDataReaderRef.current;
      if (curReader) {
        // First drop the ref, so any async operation will not proceed
        // while we are waiting for the cancel to finish next
        mainDataReaderRef.current = null;
        await curReader.cancel();
      }

      // As we will read from the start, we reset this flag
      setDataSourceExhausted(false);
      // And any error
      setDataSourceReadError([]);
      // Fetch to target is reset to 0
      fetchTo.current = 0;
      dataReadCancelled.current = false;

      // See if this is a new data source or just re-sorting
      if (newSortParams === null) {
        // New data source. Reset actual data schema
        setActualDataSchema([]);

        // Reset row count info. We keep the loaded count,
        // because until new data is read, we still have the stale data
        const newRowCountInfo: RowCountInfo = {
          realRowCount: null,
          estimatedRowCount: null,
          availableRowCount: lastAvailableRowCount,
        };

        setRowCountInfo(newRowCountInfo);

        // Set last sort to match new sort, so we won't get into "sorting" state
        setLastSortSafe([]);
        newSortParams = [];
      } else {
        setLastSortSafe(sort);
      }

      // Save new sort params
      setSort(newSortParams);

      // And let the new reader be created in the background
      await getNewReader(newSortParams);
    },
    [actualDataSchema, cancelAllDataOperations, getNewReader, staleData, setLastSortSafe, sort],
  );

  /**
   * -------------------------------------------------------------
   * Functions related to data fetching
   * -------------------------------------------------------------
   */

  /**
   * The actual function that reads the data from the reader until `fetchTo` rows are read
   * or the reader is done/closed.
   *
   * Only one of this can be running at a time (or othersise we have a bug).
   * See `fetchData` for the multi-call compatibile interface.
   *
   * @param options Options for the fetch. Used for internal retries, do not pass
   *              anything from outer calls.
   */
  const fetchDataSingleEntry = useCallback(
    async (options = { retry_with_file_sync: true }) => {
      // Get the abort signal so all of this can be cancelled
      const abortSignal = getDataFetchAbortSignal();

      let readAll = false;
      let inferredSchema: DBTableOrViewSchema | null = null;
      let afterRetry = false;

      // Set actual data schema on first read
      let updateSchemaFromInferred = actualData.current.length === 0;

      try {
        // Stop fetching when the reader is done or fetch is cancelled
        while (
          !readAll &&
          mainDataReaderRef.current !== null &&
          !mainDataReaderRef.current.closed &&
          !abortSignal.aborted &&
          // If we read enough data, we can stop
          (fetchTo.current === null || actualData.current.length < fetchTo.current)
        ) {
          // Run an abortable read
          const { done, value } = await Promise.race([
            mainDataReaderRef.current.next(),
            new Promise<never>((_, reject) => {
              abortSignal.addEventListener('abort', () => {
                reject(
                  new DOMException(
                    'Operation cancelled as it was replaced by a newer copy/export request',
                    'Cancelled',
                  ),
                );
              });
            }),
          ]);

          if (done) {
            readAll = true;
            break;
          }

          // Infer schema once on first non empty batch
          if (!inferredSchema) {
            inferredSchema = getArrowTableSchema(value);
          }

          const newTableData = convertArrowTable(value, inferredSchema);

          actualData.current.push(...newTableData);

          // Set schema it this is the first read
          // We do it here in the loop together with moving the data version
          // and unsetting stale data instead of outside, to allow
          // immediately showing the data to the user, even if we need
          // to continue reading more data.
          if (updateSchemaFromInferred) {
            setActualDataSchema(inferredSchema);

            updateSchemaFromInferred = false;
          }

          // We have read at least something, reset the stale data
          setStaleData(null);
          // Update loaded row count
          setAvailableRowCount(actualData.current.length);
          // And ping downstream components that data has changed
          setDataVersion((prev) => prev + 1);
        }
      } catch (error: any) {
        if (error.message?.includes('NotReadableError')) {
          if (options.retry_with_file_sync) {
            // First try to sync files, that may re-create a working handle
            await syncFiles(pool);
            // Do a full reset to the same sort. This will put the current batch
            // of data to stale state, re-create the reader etc.
            await reset(sort);

            // Re-enter the fetch loop
            await fetchDataSingleEntry({
              retry_with_file_sync: false,
            });

            afterRetry = true;
          } else {
            // We got an unrecoverable actual error
            console.error('Data source have been moved or deleted:', error);
            setAppendDataSourceReadError('Data source have been moved or deleted.');
          }
        } else if (isSchemaError(error)) {
          if (options.retry_with_file_sync) {
            // Schema mismatch detected - sync files and recreate views
            await syncFiles(pool);
            // Do a full reset to the same sort. This will put the current batch
            // of data to stale state, re-create the reader etc.
            await reset(sort);

            // Re-enter the fetch loop
            await fetchDataSingleEntry({
              retry_with_file_sync: false,
            });

            afterRetry = true;
          } else {
            // We got an unrecoverable schema mismatch error
            console.error('Schema mismatch detected:', error);
            setAppendDataSourceReadError('Data source schema has changed. Please refresh the tab.');
          }
        } else if (!abortSignal.aborted) {
          // Fetch was not cancelled we got an actual error
          if (error.message?.includes('NotFoundError')) {
            console.error('Data source have been moved or deleted:', error);
            setAppendDataSourceReadError('Data source have been moved or deleted.');
          } else {
            console.error('Failed to read data from the data source:', error);
            setAppendDataSourceReadError(
              'Failed to read data from the data source. See console for technical details.',
            );
          }
        }
      }

      // If we reach here after we did a nested invocation for retry,
      // do not do post-actions as they should have been done in the inner invocation.
      if (!afterRetry) {
        // And do final updates after the end of the fetch loop or abort
        const availableRowCount = actualData.current.length;

        const newCachedStaleDataUpdate: Partial<StaleData> = {
          data: actualData.current.slice(-MAX_PERSISTED_STALE_DATA_ROWS),
          rowOffset: Math.max(0, actualData.current.length - MAX_PERSISTED_STALE_DATA_ROWS),
        };

        if (inferredSchema) {
          // We have a schema, so we can set it in the cache
          newCachedStaleDataUpdate.schema = inferredSchema;
        }

        if (readAll) {
          // Now we know that we have read all the data
          setDataSourceExhausted(true);
          // Set the real row count
          setRealRowCount(availableRowCount);

          // Also add info to the cache update object
          newCachedStaleDataUpdate.realRowCount = availableRowCount;
          newCachedStaleDataUpdate.estimatedRowCount = null;
        }

        updateTabDataViewStaleDataCache(tab.id, {
          staleData: newCachedStaleDataUpdate,
          sort,
        });
      }
    },
    [
      getDataFetchAbortSignal,
      setAvailableRowCount,
      pool,
      reset,
      sort,
      setAppendDataSourceReadError,
      tab.id,
      setRealRowCount,
    ],
  );

  /**
   * Abortable multi-entry function that fetches the data until `rowTo` rows are read
   * or the reader is done/closed.
   *
   * @param rowTo The number of rows to fetch at least. If `null`,
   *              fetch until the reader is exhausted.
   * @param curSort The current sort spec (passed as param to avoid recreating callback)
   */
  const fetchData = useCallback(
    async ({
      rowTo,
      curSort,
    }: {
      rowTo: number | null;
      curSort: ColumnSortSpecList;
    }): Promise<void> => {
      if (
        // No reader - no fetching
        !mainDataReaderRef.current ||
        // Do not try to read from an exhausted data source.
        dataSourceExhausted ||
        // Do not try to read after an error
        dataSourceError.length > 0 ||
        // We may also have cancelled the reader early, so make sure we
        // do no use closed reader either.
        mainDataReaderRef.current.closed
      ) {
        return;
      }

      // Now make sure our fetchTo is set to the requested value or beyond
      if (rowTo === null) {
        // To the end
        fetchTo.current = null;
      } else if (fetchTo.current !== null) {
        fetchTo.current = Math.max(rowTo, fetchTo.current);
      }

      // Now exit early if already fetching or have enough
      if (
        isFetchingData ||
        (fetchTo.current !== null && actualData.current.length >= fetchTo.current)
      ) {
        return;
      }

      // Deliberate request to start fetching data => drop this flag
      dataReadCancelled.current = false;

      try {
        // Update the state to show that we are fetching data.
        setIsFetchingData(true);

        // Wait for an actual fetch to finish
        await fetchDataSingleEntry();
      } finally {
        // Save last sort used. This will allow showing `isSorting` only for the
        // first fetch after sort change.
        setLastSortSafe(curSort);
        setIsFetchingData(false);
      }
    },
    [
      dataSourceExhausted,
      dataSourceError.length,
      isFetchingData,
      fetchDataSingleEntry,
      setLastSortSafe,
    ],
  );

  /**
   * -------------------------------------------------------------
   * Effects
   * -------------------------------------------------------------
   */

  // If queries change (meaning data source has changed), after mount
  // we need to reset everything, including sort
  useDidUpdate(() => {
    reset(null);
  }, [queries]);

  // If the tab is not active anymore we cancel background tasks to free up connections,
  // but keep main data load
  useEffect(() => {
    if (tab.id !== activeTabId) {
      abortUserTasks();
      abortBackgroundTasks();
    }
  }, [activeTabId, abortUserTasks, abortBackgroundTasks, tab.id]);

  // On mount we may have cached data in our local state vars,
  // so we do not want to call a full `reset`, but only to initiate reader
  // creation in the background.
  useEffect(() => {
    const newReaderPromise = getNewReader(sort);

    return () => {
      const asyncDestructor = async () => {
        // Make sure we cancel everything
        cancelAllDataOperations();

        // This will ensure that we first wait until new reader call
        // has finished. Even though it should be cancelled by
        // the previous call, we want to make sure state is fully
        // updated. Otherwise if the tab is closed quickly,
        // we may get into inconsistent state. This is also happening
        // in dev mode due to React.StrictMode firring this hook twice.
        await newReaderPromise;

        // Cancel the main data reader
        const curReader = mainDataReaderRef.current;
        if (curReader) {
          // First drop the ref, so any async operation will not proceed
          // while we are waiting for the cancel to finish next
          mainDataReaderRef.current = null;
          await curReader.cancel();
        }
      };
      asyncDestructor();
    };
    // We intentionally use this only on mount, as we want different
    // behavior on all other changes - handled by the effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Build the resulting API
   */
  const resetApi = useCallback(async () => {
    reset(sort);
  }, [reset, sort]);

  const getDataTableSlice = useCallback(
    (rowFrom: number, rowTo: number): GetDataTableSliceReturnType => {
      // Check and initiate data fetch if needed
      if (rowTo > actualData.current.length) {
        // This is ok to call multiple times, it handles multi-entry,
        // as well as futile calls when data source is exhausted
        fetchData({
          rowTo,
          curSort: sort,
        });
      }

      // If we have some actual data use it to get what is necessary
      let dataToUse: DataTable = [];
      let offset = 0;

      if (isStale) {
        dataToUse = staleData.data;
        offset = staleData.rowOffset;
      } else {
        dataToUse = actualData.current;
      }

      // Now try to get as close of a chunk of data to requested as possible
      const requestedPageSize = Math.max(0, rowTo - rowFrom);
      const returnRowTo = Math.min(dataToUse.length + offset, rowTo);
      const returnRowFrom = Math.max(0, returnRowTo - requestedPageSize);
      const returnData = dataToUse.slice(returnRowFrom - offset, returnRowTo - offset);

      // If we have a non-empty schema, means we have (possibly empty) data
      // and we should return it
      if (currentSchema.length > 0) {
        return {
          data: returnData,
          rowOffset: returnRowFrom,
        };
      }

      // If we have no schema, we should return null
      // as we have no data to show
      return null;
    },
    [currentSchema, fetchData, sort, isStale, staleData],
  );

  const getAllTableData = useCallback(
    async (columns: DBColumn[] | null): Promise<DataTable> => {
      // Figure out if it is more efficient and possible to read
      // specific columns via a query or we have to/better just
      // read all data and subset columns via JS.
      // We may have a better heuristic for this, but for now
      // keeping it simple.
      if (
        // If this is an entire table request - we have to read all
        columns &&
        // No point in querying if all data has been read UNLESS
        // the requested columns are not a strict subset of the current schema
        (!dataSourceExhausted || !isStrictSchemaSubset(currentSchema, columns)) &&
        // No point in querying if the entire schema is requested
        !isSameSchema(columns, currentSchema) &&
        // And the data source must support subsetting columns
        queries.getColumnsData
      ) {
        // Abort previous background tasks
        abortUserTasks();

        // Get new abort signal
        const signal = getUserTasksAbortSignal();

        const { value, aborted } = await queries.getColumnsData(columns, signal);

        if (aborted) {
          throw new CancelledOperation({
            isUser: false,
            reason: 'Operation cancelled as it was replaced by a newer copy/export request',
          });
        }

        return value;
      }

      if (!dataSourceExhausted) {
        // Fetch all
        await fetchData({
          rowTo: null,
          curSort: sort,
        });
      }

      // Return all data for simplicity, this will include all needed columns
      // We've already checked that it is a strict subset above, so this
      // should be safe
      return actualData.current;
    },
    [
      dataSourceExhausted,
      currentSchema,
      queries,
      abortUserTasks,
      getUserTasksAbortSignal,
      fetchData,
      sort,
    ],
  );

  const toggleColumnSort = useCallback(
    (columnName: string): void => {
      if (disableSort) return;

      const newSortParams = toggleMultiColumnSort(sort, columnName);

      // Reset the data
      reset(newSortParams);
    },
    [disableSort, sort, reset],
  );

  const isSorting = useMemo(() => {
    return !isTheSameSortSpec(sort, lastSort);
  }, [sort, lastSort]);

  const getColumnAggregate = useCallback(
    async (columnName: string, aggType: ColumnAggregateType): Promise<any | undefined> => {
      if (!queries.getColumnAggregate) {
        // No column aggregate function available
        return Promise.resolve(undefined);
      }

      // Abort previous background tasks
      abortUserTasks();

      // Get new abort signal
      const signal = getUserTasksAbortSignal();

      const { value, aborted } = await queries.getColumnAggregate(columnName, aggType, signal);

      if (aborted) {
        throw new CancelledOperation({
          isUser: false,
          reason: 'Operation cancelled as it was replaced by a newer column aggregate request',
        });
      }

      return value;
    },
    [queries, abortUserTasks, getUserTasksAbortSignal],
  );

  const getChartAggregatedData = useCallback(
    async (
      xColumn: string,
      yColumn: string,
      aggregation: ChartAggregationType,
      groupByColumn: string | null,
      sortBy: 'x' | 'y',
      sortOrder: ChartSortOrder | null,
    ): Promise<ChartAggregatedData | undefined> => {
      if (!queries.getChartAggregatedData) {
        // Chart aggregation not available for this data source
        return Promise.resolve(undefined);
      }

      // Abort previous background tasks
      abortUserTasks();

      // Get new abort signal
      const signal = getUserTasksAbortSignal();

      const { value, aborted } = await queries.getChartAggregatedData(
        xColumn,
        yColumn,
        aggregation,
        groupByColumn,
        sortBy,
        sortOrder,
        signal,
      );

      if (aborted) {
        throw new CancelledOperation({
          isUser: false,
          reason: 'Operation cancelled as it was replaced by a newer chart aggregation request',
        });
      }

      return value;
    },
    [queries, abortUserTasks, getUserTasksAbortSignal],
  );

  const getColumnStats = useCallback(
    async (columnNames: string[]): Promise<ColumnStats[] | undefined> => {
      if (!queries.getColumnStats) {
        return Promise.resolve(undefined);
      }

      abortUserTasks();
      const signal = getUserTasksAbortSignal();

      const { value, aborted } = await queries.getColumnStats(columnNames, signal);

      if (aborted) {
        throw new CancelledOperation({
          isUser: false,
          reason: 'Operation cancelled as it was replaced by a newer column stats request',
        });
      }

      return value;
    },
    [queries, abortUserTasks, getUserTasksAbortSignal],
  );

  const getColumnDistribution = useCallback(
    async (
      columnName: string,
      columnType: MetadataColumnType,
    ): Promise<ColumnDistribution | undefined> => {
      if (!queries.getColumnDistribution) {
        return Promise.resolve(undefined);
      }

      abortUserTasks();
      const signal = getUserTasksAbortSignal();

      const { value, aborted } = await queries.getColumnDistribution(
        columnName,
        columnType,
        signal,
      );

      if (aborted) {
        throw new CancelledOperation({
          isUser: false,
          reason: 'Operation cancelled as it was replaced by a newer column distribution request',
        });
      }

      return value;
    },
    [queries, abortUserTasks, getUserTasksAbortSignal],
  );

  const getAllColumnDistributions = useCallback(
    async (
      columns: Array<{ name: string; type: MetadataColumnType }>,
    ): Promise<Map<string, ColumnDistribution> | undefined> => {
      if (!queries.getAllColumnDistributions) {
        return Promise.resolve(undefined);
      }

      abortUserTasks();
      const signal = getUserTasksAbortSignal();

      const { value, aborted } = await queries.getAllColumnDistributions(columns, signal);

      if (aborted) {
        throw new CancelledOperation({
          isUser: false,
          reason: 'Operation cancelled as it was replaced by a newer batch distribution request',
        });
      }

      return value;
    },
    [queries, abortUserTasks, getUserTasksAbortSignal],
  );

  const cancelDataRead = useCallback(() => {
    // this will ensure that fetching doesn't resume
    fetchTo.current = actualData.current.length;
    dataReadCancelled.current = true;
    abortDataFetch();
    setLastSortSafe(sort);
  }, [abortDataFetch, setLastSortSafe, sort]);

  const ackDataReadCancelled = useCallback(() => {
    dataReadCancelled.current = false;
  }, []);

  if (import.meta.env.DEV || __INTEGRATION_TEST__) {
    // Perform state consistency checks. Any failer here is a bug
    // so we do not include this in production, assuming this is
    // will fail in tests
    const hasData = actualDataSchema.length > 0;
    const hasStaleData = staleData !== null;

    if (!isStale && hasStaleData) {
      throw new Error('Stale data should not be available when isStale is false');
    }

    if (dataSourceError.length > 0 && (isFetchingData || !disableSort)) {
      throw new Error(
        'After data source read error we should never be in fetching state and sort should be disabled',
      );
    }

    if (isSorting && isFetchingData && disableSort) {
      throw new Error(
        'Sorting should not be possible when actively sorting (started fetching) is disabled',
      );
    }

    if (!hasData && !hasStaleData && isSorting) {
      throw new Error('It should be impossible to sort without any data');
    }
  }

  return {
    dataSourceVersion,
    dataVersion,
    currentSchema,
    isStale,
    rowCountInfo,
    disableSort,
    sort,
    dataSourceExhausted,
    dataSourceError,
    isFetchingData: isFetchingData || isCreatingReader,
    isSorting,
    dataReadCancelled: dataReadCancelled.current,
    sourceQuery: queries.sourceQuery ?? null,
    pool,
    reset: resetApi,
    getDataTableSlice,
    getAllTableData,
    toggleColumnSort,
    getColumnAggregate,
    getChartAggregatedData,
    getColumnStats,
    getColumnDistribution,
    getAllColumnDistributions,
    cancelDataRead,
    ackDataReadCancelled,
  };
};
