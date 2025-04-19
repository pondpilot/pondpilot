import { updateTabDataViewStaleDataCache } from '@controllers/tab';
import { AsyncDuckDBPooledStreamReader } from '@features/duckdb-context/duckdb-pooled-streaming-reader';
import { useAbortController } from '@hooks/use-abort-controller';
import { useDidMount } from '@hooks/use-did-mount';
import { useDidUpdate } from '@mantine/hooks';
import {
  ColumnAggregateType,
  DataAdapterApi,
  GetTableDataReturnType,
  RowCountInfo,
} from '@models/data-adapter';
import { ColumnSortSpecList, DataTable, DBColumn, DBTableOrViewSchema } from '@models/db';
import { AnyTab, MAX_PERSISTED_STALE_DATA_ROWS, StaleData, TabReactiveState } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import { isSameSchema, isTheSameSortSpec, toggleMultiColumnSort } from '@utils/db';
import { useCallback, useMemo, useRef, useState } from 'react';
import { makeAbortable } from '@utils/abort';
import { useDataAdapterQueries } from './use-data-adapter-queries';

// Data adapter is a logic layer between abstract batch streaming data source
// and the UI layer (Table component).
//
// It handles the data fetching, aggregation and caching logic.

type UseDataAdapterProps = {
  tab: TabReactiveState<AnyTab>;
};

export const useDataAdapter = ({ tab }: UseDataAdapterProps): DataAdapterApi => {
  /**
   * Hooks
   */
  const queries = useDataAdapterQueries(tab);

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

  // Current data schema. Init from cache if available.
  const [schema, setSchema] = useState<DBTableOrViewSchema>(
    () => useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.staleData?.schema || [],
  );

  // Holds stale data when available, either from persistent storage on load,
  // or from previous read when changing the driving source query or sort.
  // Init from cache if available.
  const [staleData, setStaleData] = useState<StaleData | null>(
    () => useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.staleData || null,
  );

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
        totalRowCount: cached.totalRowCount,
        loadedRowCount: cached.data.length + cached.rowOffset,
        isEstimatedRowCount: cached.isEstimatedRowCount,
      };
    }

    return {
      totalRowCount: null,
      loadedRowCount: 0,
      isEstimatedRowCount: false,
    };
  });

  // Holds current sorting spec. Init from cache if available.
  const [sort, setSort] = useState<ColumnSortSpecList>(
    () => useAppStore.getState().tabs.get(tab.id)?.dataViewStateCache?.sort || [],
  );

  // We want to let the users know whether we are fetcing from scratch becase
  // of the sort change or because of the data source change.
  const [lastSort, setLastSort] = useState<ColumnSortSpecList>(sort);

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
  const pendingFetches = useRef(0);

  /**
   * Computed State
   */

  const isStale = staleData !== null;
  const disableSort = queries.getReader !== undefined && queries.getSortableReader === undefined;

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
   * Effects & functions related to data fetching
   * -------------------------------------------------------------
   */

  /**
   * The actual function that reads the data from the reader until `fetchTo` rows are read
   * or the reader is done/closed.
   *
   * Only one of this can be running at a time (or othersise we have a bug).
   * See `fetchData` for the multi-call compatibile interface.
   *
   * @param fetchTo The number of rows to fetch at least. If `null`,
   *                     fetch until the reader is exhausted.
   * @param abortSignal The abort signal to cancel the fetch
   * @param curRowCountInfo The current row count info (passed as param to avoid recreating callback)
   */
  const fetchDataSingleEntry = useCallback(
    async (fetchTo: number | null, abortSignal: AbortSignal, curRowCountInfo: RowCountInfo) => {
      if (mainDataReader === null) {
        throw new Error('Main data reader is null while fetching data');
      }

      if (mainDataReader.closed) {
        throw new Error('Main data reader is closed while fetching data');
      }

      try {
        let readAll = false;
        let inferredSchema: DBTableOrViewSchema | null = null;
        let updatedSchemaFromInferred = false;

        // Stop fetching when the reader is done or fetch is cancelled
        while (!readAll || !mainDataReader.closed) {
          const { done, value } = await mainDataReader.next();

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

          // If schema is not matching current schema, update it.
          // We do it here in the loop together with moving the data version
          // and unsetting stale data instead of outside, to allow
          // immediately showing the data to the user, even if we need
          // to continue reading more data.
          if (!updatedSchemaFromInferred) {
            // Be clever and avoid changing the schema if it is the same
            if (!isSameSchema(schema, inferredSchema)) {
              setSchema(inferredSchema);
            }

            updatedSchemaFromInferred = false;
          }

          // We have read at least something, reset the stale data
          setStaleData(null);
          // And ping downstream components that data has changed
          setDataVersion((prev) => prev + 1);

          // If we read enough data, we can stop
          if (fetchTo && actualData.current.length >= fetchTo) break;

          // Also break if the fetch was aborted. We exit here, not
          // at the start of the loop, to ensure that whether the result
          // is empty or not, after the loop we may be sure that actual
          // data was at least partially read and we should reset stale data.
          if (abortSignal.aborted) break;
        }

        if (readAll) {
          // Now we know that we have read all the data
          setDataSourceExhausted(true);
        }

        // Update row counts if they do not match
        const loadedRowCount = actualData.current.length;
        const inferredTotalRowCount = readAll ? loadedRowCount : null;
        if (
          (curRowCountInfo.totalRowCount === null && inferredTotalRowCount !== null) ||
          (inferredTotalRowCount && inferredTotalRowCount < loadedRowCount) ||
          curRowCountInfo.loadedRowCount !== loadedRowCount ||
          curRowCountInfo.isEstimatedRowCount
        ) {
          curRowCountInfo = {
            totalRowCount: curRowCountInfo.totalRowCount || inferredTotalRowCount,
            loadedRowCount: actualData.current.length,
            isEstimatedRowCount: false,
          };

          setRowCountInfo({
            totalRowCount: actualData.current.length,
            loadedRowCount: actualData.current.length,
            isEstimatedRowCount: false,
          });
        }

        updateTabDataViewStaleDataCache(tab.id, {
          staleData: {
            schema: inferredSchema || schema,
            data: actualData.current.slice(-MAX_PERSISTED_STALE_DATA_ROWS),
            rowOffset: Math.max(0, actualData.current.length - MAX_PERSISTED_STALE_DATA_ROWS),
            totalRowCount: curRowCountInfo.totalRowCount,
            isEstimatedRowCount: !readAll,
          },
          sort,
        });
      } catch (error) {
        console.error('Failed to load more data:', error);
        setDataSourceReadError('Failed to load more data');
      }
    },
    [mainDataReader],
  );

  /**
   * Abortable multi-entry function that fetches the data until `fetchTo` rows are read
   * or the reader is done/closed.
   *
   * @param fetchTo The number of rows to fetch at least. If `null`,
   *                     fetch until the reader is exhausted.
   * @param curSort The current sort spec (passed as param to avoid recreating callback)
   * @param curRowCountInfo The current row count info (passed as param to avoid recreating callback)
   */
  const fetchData = useCallback(
    async ({
      fetchTo,
      curSort,
      curRowCountInfo,
    }: {
      fetchTo: number | null;
      curSort: ColumnSortSpecList;
      curRowCountInfo: RowCountInfo;
    }): Promise<void> => {
      // Start by incrementing the pending fetches
      pendingFetches.current += 1;

      // Never fetch twice in parallel.
      // If we are fetching, wait until all the previous fetches are done
      while (pendingFetches.current > 1) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (pendingFetches.current === 1) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

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
        // Decrement the pending fetches and return
        pendingFetches.current -= 1;
        return;
      }

      // Update the state to show that we are fetching data. Note,
      // that is may already be set to true if we reach here after
      // waiting for the previous fetch to finish.
      setIsFetchingData(true);

      const abortSignal = getDataFetchAbortSignal();

      // Wait for an actual fetch to finish
      await fetchDataSingleEntry(fetchTo, abortSignal, curRowCountInfo);

      // Decrement the pending fetches
      pendingFetches.current -= 1;

      // Save last sort used. This will allow showing `isSorting` only for the
      // first fetch after sort change.
      setLastSort(curSort);

      if (pendingFetches.current === 0) {
        // Only set this to false if there are no pending fetches.
        // This is an optimization to avoid flickers
        setIsFetchingData(false);
      }
    },
    [fetchDataSingleEntry, mainDataReader, dataSourceExhausted, dataSourceReadError, rowCountInfo],
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
      setRowCountInfo((prev) => ({
        ...prev,
        totalRowCount: Math.max(count, prev.totalRowCount || 0),
        isEstimatedRowCount: false,
      }));
    } else if (queries.getEstimatedRowCount) {
      const count = await queries.getEstimatedRowCount();
      setRowCountInfo((prev) =>
        !prev.isEstimatedRowCount
          ? prev
          : {
              ...prev,
              totalRowCount: Math.max(count, prev.totalRowCount || 0),
              isEstimatedRowCount: true,
            },
      );
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

  /**
   * Inits/resets the state by re-creating the reader with given sort params.
   */
  const reset = async () => {
    // Reset a bunch of things. This can be called from either a prop change,
    // initial mount or a sort change.

    // The real data is not needed anymore, but if we had some, we should replace
    // stale data with it.
    if (actualData.current.length > 0) {
      setStaleData({
        schema,
        data: actualData.current,
        rowOffset: 0,
        totalRowCount: rowCountInfo.totalRowCount,
        isEstimatedRowCount: rowCountInfo.isEstimatedRowCount,
      });

      actualData.current.length = 0;
    }

    // Cancel any pending fetches, and background tasks & readers
    cancelAllDataOperations();

    // As we will read from the start, we reset this flag
    setDataSourceExhausted(false);
    // And any error
    setDataSourceReadError(null);

    // Reset row count info
    const newRowCountInfo = {
      totalRowCount: null,
      loadedRowCount: 0,
      isEstimatedRowCount: false,
    };

    setRowCountInfo(newRowCountInfo);

    // And create a new reader if we have a query for that
    if (queries.getReader || queries.getSortableReader) {
      queries.getSortableReader
        ? setMainDataReader(await queries.getSortableReader(sort))
        : setMainDataReader(await queries.getReader!());

      setDataSourceVersion((prev) => prev + 1);

      // Send row count fetching to background
      fetchRowCount();
    }
  };

  /**
   * If queries change, we need to reset the reader
   */
  useDidUpdate(() => {
    reset();
  }, [queries]);

  /**
   * Restore from cache if available
   */
  useDidMount(() => {
    reset();

    return () => {
      // Make sure we cancel everything
      cancelAllDataOperations();
    };
  });

  /**
   * Build the resulting API
   */
  const getTableData = useCallback(
    (rowFrom: number, rowTo: number): GetTableDataReturnType => {
      // Check and initiate data fetch if needed
      if (rowTo > actualData.current.length) {
        // This is ok to call multiple times, it handles multi-entry
        fetchData({
          fetchTo: rowTo,
          curSort: sort,
          curRowCountInfo: rowCountInfo,
        });
      }

      // If we have some actual data use it to get what is necessary
      let dataToUse: DataTable = [];
      let offset = 0;

      if (schema.length > 0 && actualData.current.length > 0) {
        dataToUse = actualData.current;
      } else if (staleData) {
        dataToUse = staleData.data;
        offset = staleData.rowOffset;
      }

      // Now try to get as close of a chunk of data to requested as possible
      const requestedPageSize = Math.max(0, rowTo - rowFrom);
      const returnRowTo = Math.min(dataToUse.length + offset, rowTo);
      const returnRowFrom = Math.max(0, returnRowTo - requestedPageSize);
      const returnData = dataToUse.slice(returnRowFrom - offset, returnRowTo - offset);

      // If we have a non-empty schema, means we have (possibly empty) data
      // and we should return it
      if (schema.length > 0) {
        return {
          data: returnData,
          rowFrom: returnRowFrom,
          rowTo: returnRowTo,
        };
      }

      // If we have no schema, we should return null
      // as we have no data to show
      return null;
    },
    [schema, fetchData, sort, rowCountInfo],
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
        columns.length < schema.length &&
        // And the data source must support subsetting columns
        queries.getColumnsData
      ) {
        // Abort previous background tasks
        abortBackgroundTasks();

        // Get new abort signal
        const signal = getBackgroundTasksAbortSignal();

        return makeAbortable(
          queries.getColumnsData,
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
        )(columns);
      }

      if (!dataSourceExhausted) {
        // Fetch all
        await fetchData({
          fetchTo: null,
          curSort: sort,
          curRowCountInfo: rowCountInfo,
        });
      }

      // Return all data for simplicity, this will include all needed columns
      return actualData.current;
    },
    [fetchData, schema, sort, rowCountInfo, queries.getColumnsData],
  );

  const toggleColumnSort = useCallback(
    (columnName: string): void => {
      if (disableSort) return;

      const newSortParams = toggleMultiColumnSort(sort, columnName);
      // Save last sort to be able to compare it with the new one
      setLastSort(sort);

      // Set the new sort params
      setSort(newSortParams);
    },
    [disableSort],
  );

  const isSorting = useMemo(() => !isTheSameSortSpec(sort, lastSort), [sort, lastSort]);

  const getColumnAggregate = useCallback(
    (columnName: string, aggType: ColumnAggregateType): Promise<any | undefined> => {
      if (!queries.getColumnAggregate) {
        // No column aggregate function available
        return Promise.resolve(undefined);
      }

      // Abort previous background tasks
      abortBackgroundTasks();

      // Get new abort signal
      const signal = getBackgroundTasksAbortSignal();

      return makeAbortable(
        queries.getColumnAggregate,
        new Promise<undefined>((resolve, _) => {
          signal.addEventListener('abort', () => {
            resolve(undefined);
          });
        }),
      )(columnName, aggType);
    },
    [queries.getColumnAggregate, abortBackgroundTasks, getBackgroundTasksAbortSignal],
  );

  const cancelDataRead = useCallback(() => {
    // Maybe we do not need this callback and can just pass
    // abort function directly, as it is no-op when nothing is
    // being fetched. Or maybe we need to do more here...
    if (isFetchingData) {
      abortDataFetch();
    }
  }, [isFetchingData, abortDataFetch]);

  if (import.meta.env.DEV) {
    // Perform state consistency checks. Any failuer here is a bug
    // so we do not include this in production, assuming this is
    // will fail in tests
    const hasData = schema.length > 0;
    const hasStaleData = staleData !== null;

    if (!isStale && hasStaleData) {
      throw new Error('Stale data should not be available when isStale is false');
    }

    if (dataSourceReadError !== null && (isFetchingData || isSorting)) {
      throw new Error('After data source read error we should never be in fetching/sorting state');
    }

    if (isSorting && !isFetchingData) {
      throw new Error('Sorting should always be in fetching state');
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
    currentSchema: schema,
    isStale,
    rowCountInfo,
    disableSort,
    sort,
    dataSourceExhausted,
    dataSourceError,
    isFetchingData,
    isSorting,
    getTableData,
    getAllTableData,
    toggleColumnSort,
    getColumnAggregate,
    cancelDataRead,
  };
};
