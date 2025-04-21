import { updateTabDataViewStaleDataCache } from '@controllers/tab';
import { AsyncDuckDBPooledStreamReader } from '@features/duckdb-context/duckdb-pooled-streaming-reader';
import { useAbortController } from '@hooks/use-abort-controller';
import { useDidMount } from '@hooks/use-did-mount';
import { useDidUpdate } from '@mantine/hooks';
import {
  ColumnAggregateType,
  DataAdapterApi,
  GetDataTableSliceReturnType,
  RowCountInfo,
} from '@models/data-adapter';
import { ColumnSortSpecList, DataTable, DBColumn, DBTableOrViewSchema } from '@models/db';
import { AnyTab, MAX_PERSISTED_STALE_DATA_ROWS, StaleData, TabReactiveState } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import { isTheSameSortSpec, toggleMultiColumnSort } from '@utils/db';
import { useCallback, useMemo, useRef, useState } from 'react';
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

  // This is for all background tasks (row counts, column summary, etc.).
  // We use it internally to only run one task at a time.
  const { getSignal: getBackgroundTasksAbortSignal, abort: abortBackgroundTasks } =
    useAbortController();

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

  // Holds the current connection to the database
  const [mainDataReader, setMainDataReader] = useState<AsyncDuckDBPooledStreamReader<any> | null>(
    null,
  );

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
  const [dataSourceReadError, setDataSourceReadError] = useState<string | null>(null);

  const [isFetchingData, setIsFetchingData] = useState(false);

  /**
   * Local Non-reactive State
   */

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

  // Disable sorting if:
  // - there is no sortable reader (data source is missing or doesn't support sorting)
  // - there is no data available (schema is empty)
  // - there was an error reading data
  const disableSort =
    queries.getSortableReader === undefined ||
    currentSchema.length === 0 ||
    dataSourceReadError !== null;

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

    return buildErrors.length > 0 ? `- ${buildErrors.join('\n- ')}` : null;
  }, [queries]);

  const dataSourceError = dataSourceReadError || dataQueriesBuildError;

  /**
   * -------------------------------------------------------------
   * Set wrappers for convinience
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
   * Effects & functions related to data fetching
   * -------------------------------------------------------------
   */

  /**
   * The actual function that reads the data from the reader until `fetchTo` rows are read
   * or the reader is done/closed.
   *
   * Only one of this can be running at a time (or othersise we have a bug).
   * See `fetchData` for the multi-call compatibile interface.
   */
  const fetchDataSingleEntry = useCallback(async () => {
    if (mainDataReader === null) {
      throw new Error('Main data reader is null while fetching data');
    }

    if (mainDataReader.closed) {
      throw new Error('Main data reader is closed while fetching data');
    }

    // Get the abort signal so all of this can be cancelled
    const abortSignal = getDataFetchAbortSignal();

    let readAll = false;
    let inferredSchema: DBTableOrViewSchema | null = null;

    // Set actual data schema on first read
    let updateSchemaFromInferred = actualData.current.length === 0;

    try {
      // Stop fetching when the reader is done or fetch is cancelled
      while (
        !readAll &&
        !mainDataReader.closed &&
        !abortSignal.aborted &&
        // If we read enough data, we can stop
        (fetchTo.current === null || actualData.current.length < fetchTo.current)
      ) {
        // Run an abortable read
        const { done, value } = await Promise.race([
          mainDataReader.next(),
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

        const newTableData = convertArrowTable(value);

        actualData.current.push(...newTableData);

        // Infer schema once on first non empty batch
        if (!inferredSchema) {
          inferredSchema = getArrowTableSchema(value);
        }

        // Seet schema it this is the first read
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
    } catch (error) {
      if (!abortSignal.aborted) {
        // Fetch was not cancelled we got an actual error
        console.error('Failed to load more data:', error);
        setDataSourceReadError('Failed to load more data. See console for technical details.');
      }
    }

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
  }, [mainDataReader, sort, getDataFetchAbortSignal]);

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
        !mainDataReader ||
        // Do not try to read from an exhausted data source.
        dataSourceExhausted ||
        // Do not try to read after an error
        dataSourceReadError ||
        // We may also have cancelled the reader early, so make sure we
        // do no use closed reader either.
        mainDataReader.closed
      ) {
        return;
      }

      // Now make sure our fetchTo is set to the requested value or beyond
      if (rowTo === null) {
        // To the ed
        fetchTo.current = null;
      } else if (fetchTo.current !== null) {
        fetchTo.current = Math.max(rowTo, fetchTo.current);
      }

      // Now exist early if already fetching or have enough
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
      fetchDataSingleEntry,
      mainDataReader,
      isFetchingData,
      dataSourceExhausted,
      dataSourceReadError,
      rowCountInfo,
    ],
  );

  /**
   * -------------------------------------------------------------
   * Effects & functions related to data source / prop changes
   * -------------------------------------------------------------
   */

  const fetchRowCount = useCallback(async () => {
    // It is feasible that we have already got the real count for small
    // table from the first fetch. Do not overwrite better data
    if (queries.getRowCount) {
      const count = await queries.getRowCount();
      setRealRowCount(count);
    } else if (queries.getEstimatedRowCount) {
      const count = await queries.getEstimatedRowCount();
      setEstimatedRowCount(count);
    }
  }, [queries.getRowCount, queries.getEstimatedRowCount]);

  const cancelAllDataOperations = useCallback(() => {
    // Cancel any pending fetches, and background tasks
    abortDataFetch();
    abortBackgroundTasks();

    // Cancel the main data reader
    if (mainDataReader) {
      mainDataReader.cancel();
      setMainDataReader(null);
    }
  }, [mainDataReader, abortDataFetch, abortBackgroundTasks]);

  const getNewReader = async (newSortParams: ColumnSortSpecList) => {
    if (queries.getReader || queries.getSortableReader) {
      queries.getSortableReader
        ? setMainDataReader(await queries.getSortableReader(newSortParams))
        : setMainDataReader(await queries.getReader!());

      setDataSourceVersion((prev) => prev + 1);

      // Send row count fetching to background if we do not have it already
      if (!rowCountInfo.realRowCount) {
        fetchRowCount();
      }
    }
  };

  /**
   * Resets the state by re-creating the reader with given sort params.
   *
   * This is called in two scenarios:
   * 1. When the data source changes (e.g. new query) - `newSortParams` are null
   * 2. When the sort changes - `newSortParams` are, well, the new sort params
   */
  const reset = (newSortParams: ColumnSortSpecList | null) => {
    // Reset a bunch of things.

    // The real data is not needed anymore, we should replace
    // stale data with it.
    const lastAvailableRowCount = actualData.current.length;

    setStaleData({
      schema: actualDataSchema.slice(),
      data: actualData.current,
      rowOffset: 0,
    });

    actualData.current = [];

    // Cancel any pending fetches, and background tasks & readers
    cancelAllDataOperations();

    // As we will read from the start, we reset this flag
    setDataSourceExhausted(false);
    // And any error
    setDataSourceReadError(null);
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
    getNewReader(newSortParams);
  };

  /**
   * If queries change (data source), we need to reset everything
   */
  useDidUpdate(() => {
    reset(null);
  }, [queries]);

  /**
   * On mount we may have cached data in our local state vars,
   * so we do not wnat a full reset, but only to initiate reader
   * creation in the background.
   */
  useDidMount(() => {
    getNewReader(sort);

    return () => {
      // Make sure we cancel everything
      cancelAllDataOperations();
    };
  });

  /**
   * Build the resulting API
   */
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
    [currentSchema, fetchData, sort, rowCountInfo, isStale, staleData],
  );

  const getAllTableData = useCallback(
    async (columns: DBColumn[] | null): Promise<DataTable> => {
      // Figure out if it is more efficient and possible to read
      // specific columns via a query or we have to/better just
      // read all data and subset columns via JS.
      // We may have a better heuristic for this, but for now
      // keeping it simple.
      if (
        // No point in querying if all data has been read
        !dataSourceExhausted &&
        // Also, if this is an entire table request - we have to read all
        columns &&
        columns.length < currentSchema.length &&
        // And the data source must support subsetting columns
        queries.getColumnsData
      ) {
        // Abort previous background tasks
        abortBackgroundTasks();

        // Get new abort signal
        const signal = getBackgroundTasksAbortSignal();

        const result = await Promise.race([
          queries.getColumnsData(columns),
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
              reject(
                new DOMException(
                  'Operation cancelled as it was replaced by a newer copy/export request',
                  'Cancelled',
                ),
              );
            });
          }),
        ]);

        return result;
      }

      if (!dataSourceExhausted) {
        // Fetch all
        await fetchData({
          rowTo: null,
          curSort: sort,
        });
      }

      // Return all data for simplicity, this will include all needed columns
      return actualData.current;
    },
    [
      fetchData,
      dataSourceExhausted,
      currentSchema,
      sort,
      rowCountInfo,
      queries.getColumnsData,
      getBackgroundTasksAbortSignal,
    ],
  );

  const toggleColumnSort = useCallback(
    (columnName: string): void => {
      if (disableSort) return;

      const newSortParams = toggleMultiColumnSort(sort, columnName);

      // Reset the data
      reset(newSortParams);
    },
    // we must include all transient deps from reset
    [disableSort, sort, actualDataSchema, cancelAllDataOperations, fetchRowCount],
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
      abortBackgroundTasks();

      // Get new abort signal
      const signal = getBackgroundTasksAbortSignal();

      const result = await Promise.race([
        queries.getColumnAggregate(columnName, aggType),
        new Promise<undefined>((resolve, _) => {
          signal.addEventListener('abort', () => {
            resolve(undefined);
          });
        }),
      ]);

      return result;
    },
    [queries.getColumnAggregate, abortBackgroundTasks, getBackgroundTasksAbortSignal],
  );

  const cancelDataRead = useCallback(() => {
    // this will ensure that fetching doesn't resume
    fetchTo.current = actualData.current.length;
    dataReadCancelled.current = true;
    abortDataFetch();
  }, [abortDataFetch]);

  const ackDataReadCancelled = useCallback(() => {
    dataReadCancelled.current = false;
  }, []);

  if (import.meta.env.DEV) {
    // Perform state consistency checks. Any failuer here is a bug
    // so we do not include this in production, assuming this is
    // will fail in tests
    const hasData = actualDataSchema.length > 0;
    const hasStaleData = staleData !== null;

    if (!isStale && hasStaleData) {
      throw new Error('Stale data should not be available when isStale is false');
    }

    if (dataSourceReadError !== null && (isFetchingData || isSorting || !disableSort)) {
      throw new Error('After data source read error we should never be in fetching/sorting state');
    }

    if (isSorting && disableSort) {
      throw new Error('Sorting should not be possible when sorting is disabled');
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
    isFetchingData,
    isSorting,
    dataReadCancelled: dataReadCancelled.current,
    getDataTableSlice,
    getAllTableData,
    toggleColumnSort,
    getColumnAggregate,
    cancelDataRead,
    ackDataReadCancelled,
  };
};
