import { Table } from '@components/table/table';
import { DataAdapterApi } from '@models/data-adapter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AsyncRecordBatchStreamReader } from 'apache-arrow';
import { setDataTestId } from '@utils/test-id';
import { useDidMount } from '@hooks/use-did-mount';
import { updateDataViewCache, useAppStore } from '@store/app-store';
import { Affix, Group, Loader, Stack, Text } from '@mantine/core';
import { DataViewCacheItem } from '@models/data-view';
import { useDidUpdate } from '@mantine/hooks';
import { RowCountAndPaginationControl } from '@components/row-count-and-pagination-control/row-count-and-pagination-control';
import { DataLoadingOverlay } from '@components/data-loading-overlay';
import { ColumnSortSpec, DBColumn, DBTableOrViewSchema } from '@models/db';
import { useSort } from '../useSort';
import { useColumnSummary } from '../hooks';

const MAX_PAGE_SIZE = 100;

// Data View is a logic layer between abstract batch streaming data provider (represented
// via DataAdapterApi) and the UI layer (Table component).
// It handles the data fetching, pagination, and caching logic.
//
// In terms of datat it may have the following states:
// 1. Actual data is available up-to or beyond the current page
// 2. Data source is not exhausted, but actual data is not yet loaded to the current page.
//    Note that this is both the initial state, and intermediate state when
//    the user selects a page "far enough" from the current page.
// 2.1. Cached data is available
// 2.2. No cached data is available
// 3. Data source is exhausted, no more data is available.
// 4. Data source reading error
// 4.1. Cached data is available
// 4.2. No cached data is available
//
// Initially as well as after sort changes, the reader from the data adapter is created.
// As it is asynchronous, we have three possible states:
// 1. Data adapter is not ready yet (being created)
// 2. Data adapter is ready
// 3. Data adapter failed to create (this also implies the data source error above)
//
// Another important thing is the total row count. We actually have three different row counts:
// 1. Estimated row count
//    May be available at the start via the data adapter API.
// 2. Loaded row count - how many rows we have loaded so far.
// 3. Total real row count
//    May be available at the start via the data adapter API.
//    The final row count is set when the data source is exhausted.

interface DataViewProps {
  visible: boolean;
  canExport?: boolean;

  dataAdapterApi: DataAdapterApi;
}

export const DataView = ({ visible, dataAdapterApi }: DataViewProps) => {
  /**
   * Helpful hooks
   */
  const { sortParams, handleSort, resetSort } = useSort();
  const {
    calculateColumnSummary,
    columnTotal,
    isNumeric,
    resetTotal: resetCalculatedValue,
    isLoading: isColumnCalculating,
  } = useColumnSummary(dataAdapterApi);

  /**
   * Local Reactive State
   */
  // Holds the current connection to the database
  const [reader, setReader] = useState<AsyncRecordBatchStreamReader | null>(null);

  // Two sets of data. One stale (from cache, including when created from a previous sort state)
  // and one actual (from the current reader)
  // We use ref, to allow mutating these, instead of re-creating on every append.
  // The component is still reactive to new data loads because we toggle `isFetchingData` state
  // when we load data
  const localCache = useRef<DataViewCacheItem>(null);
  const actualData = useRef<Record<string, any>[]>([]);

  const [schema, setSchema] = useState<DBTableOrViewSchema>([]);

  // Estimated row count may be available via the data adapter API for some data sources.
  const [estimatedRowCount, setEstimatedRowCount] = useState<number | null>(null);
  // Real row count is either known from the API from scratch, or set when the data source is exhausted.
  const [realRowCount, setRealRowCount] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(0);

  const [dataSourceExhausted, setDataSourceExhausted] = useState(false);
  const [dataSourceReadError, setDataSourceReadError] = useState<string | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);
  // Yes, two `isFetchingData` vars. One for UI as state, and another as ref,
  // to ensure that multiple async effects are not trying to fetch data at the same time.
  // These effects use an async function created in a closure which may not have the
  // latest value of the state => hence a separate ref.
  const isFetchingRef = useRef(false);

  /**
   * Computed State
   */
  const cacheKey = dataAdapterApi.getCacheKey();

  const loadedRowCount = actualData.current.length;
  const realOrEstimatedRowCount =
    realRowCount && !dataSourceExhausted
      ? realRowCount
      : estimatedRowCount
        ? Math.max(estimatedRowCount, loadedRowCount)
        : loadedRowCount;

  const isSinglePage = realOrEstimatedRowCount < MAX_PAGE_SIZE;

  // The real requested row range. `expectedRowTo` also tells us how much data we need
  // to fetch to fill the current page.
  const expectedRowFrom = Math.max(0, currentPage * MAX_PAGE_SIZE);
  const expectedRowTo = realRowCount
    ? // if we know the real row count, we can calculate the expected rowTo precisely
      Math.min(realRowCount, (currentPage + 1) * MAX_PAGE_SIZE)
    : // if we don't know the real row count, we fall back to the loaded row count
      // if we know the data source is exhausted, or assume the entire page will be filled.
      // If we didn't make a mistake, realRowCount should always exist if we've exhausted
      // the data source, but we are playing safe here.
      dataSourceExhausted
      ? loadedRowCount
      : (currentPage + 1) * MAX_PAGE_SIZE;

  // Should we show a stale data instead of real data?
  const useStaleData = localCache.current !== null && expectedRowTo > loadedRowCount;

  // The actual row range to show in the table. It may be different from the expected row range
  const displayedRowFrom = useStaleData ? localCache.current!.rowFrom : expectedRowFrom;
  const displayedRowTo = useStaleData ? localCache.current!.rowTo : expectedRowTo;

  // Whether we should show the table at all. I.e. we have either actual or stale data.
  // Note, that empty data is also data (query can return 0 rows).
  // Since we always have actual data (potentially empty), this simplifies to just
  // checking if we have cache obkect. Again, empty data is also data.
  // One other requirement is that we have a schema, otherwise we can't show the table.
  const showTable =
    (!isFetchingData && schema.length > 0) ||
    (localCache.current !== null && localCache.current.schema.length > 0);

  // Whether we should show a loading overlay
  const showLoadingOverlay = !showTable;

  // Should we allow pagination?
  const isPaginationDisabled = useStaleData || isFetchingData || dataSourceReadError !== null;

  // Now get the data to be used by the table
  const displaySchema = useStaleData ? localCache.current!.schema : schema;
  const displayData = useMemo(() => {
    let dataSlice;

    if (useStaleData) {
      dataSlice = localCache.current!.data.slice();
    } else {
      dataSlice = actualData.current.slice(expectedRowFrom, expectedRowTo);
    }

    return dataSlice;
  }, [expectedRowFrom, expectedRowTo, useStaleData, isFetchingData]);

  /**
   * Shared closures
   */

  const getNewReader = async (newSortParams: ColumnSortSpec | null | undefined) => {
    // Now try creating the reader. This may throw an error, so catch it
    try {
      const newReader = await dataAdapterApi.getReader(newSortParams ? [newSortParams] : []);
      const newSchema = await dataAdapterApi.getSchema();
      setReader(newReader);
      setSchema(newSchema);
    } catch (error) {
      console.error('Failed to create reader:', error);
      setDataSourceReadError('Failed to create reader');
    }
  };

  /**
   * Inits/resets the data view by re-creating the reader with given sort params.
   */
  const reset = (newSortParams: ColumnSortSpec | null) => {
    // Reset a bunch of things. This can be called from either a prop change,
    // initial mount or a sort change.

    // The real data is not needed anymore
    actualData.current.length = 0;

    // We avoid unnecessary re-renders on mount by only setting the new
    // state if the value is different.

    // Page is reset to 0, as we need to fetch data from the start
    if (currentPage !== 0) setCurrentPage(0);
    // As we will read from the start, we reset this flag
    if (dataSourceExhausted) setDataSourceExhausted(false);
    // And any error
    if (dataSourceReadError) setDataSourceReadError(null);

    // Fially we reset the reader and then asynchronously start a process
    // similar to init, but with new sort params
    if (reader) setReader(null);

    getNewReader(newSortParams);
  };

  /**
   * Exvent handlers
   */
  const handleNextPage = async () => {
    const nextPage = currentPage + 1;

    // Check we are not accidentally switch past the end of the data,
    const newExpectedRowFrom = nextPage * MAX_PAGE_SIZE;
    if (newExpectedRowFrom >= realOrEstimatedRowCount) {
      return;
    }

    setCurrentPage(nextPage);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
    }
  };

  /**
   * Handle sorting - create a new reader with sort parameters
   */
  const handleSortAndGetNewReader = (sortField: DBColumn['name']) => {
    // Update the sort params
    const newSortParams = handleSort(sortField);

    // Reset the data view with the new sort params
    reset(newSortParams);
  };

  /**
   * Update the data view cache every time displayed data changes
   */
  useEffect(() => {
    // We do not want infinite loops here
    if (useStaleData) return;

    if (localCache.current) {
      localCache.current.data = displayData;
      // For simplicity we sasve the schema every time too, although
      // it should never change after first real data load
      localCache.current.schema = displaySchema;
      localCache.current.rowFrom = displayedRowFrom;
      localCache.current.rowTo = displayedRowTo;
      localCache.current.dataPage = currentPage;

      updateDataViewCache({
        key: cacheKey,
        data: displayData,
        schema: displaySchema,
        rowFrom: displayedRowFrom,
        rowTo: displayedRowTo,
        dataPage: currentPage,
      });
    }
  }, [displayData, displaySchema, displayedRowFrom, displayedRowTo, currentPage, useStaleData]);

  /**
   * Fetch more data when necessary
   */

  // Do not run on mount, useless. Reader will be empty until our
  // onDidMount effect runs.
  useDidUpdate(() => {
    const fetchData = async () => {
      if (
        // Reader check is not necessary, we should never call this function
        // if reader is not set. But let's be safe.
        !reader ||
        // Do not try to read from an exhausted data source - we do not check
        // the state, as this is triggered in an effect and may have outdated
        // closure values.
        reader.closed ||
        // Avoid multiple effects trying to fetch data at the same time,
        // which can happend at least in dev mode because of the strict mode.
        isFetchingRef.current ||
        // Do not read if we already have enough data
        actualData.current.length >= expectedRowTo
      ) {
        return;
      }

      try {
        // Start fetching data (see why two separate at definition)
        setIsFetchingData(true);
        isFetchingRef.current = true;

        let readAll = false;

        while (!readAll || reader.closed) {
          const { done, value: batchResult } = await reader.next();

          if (done) {
            readAll = true;
            break;
          }

          const newTableData = batchResult.toArray().map((row) => row.toJSON());
          actualData.current.push(...newTableData);

          if (actualData.current.length >= expectedRowTo) break;
        }

        if (readAll) {
          setDataSourceExhausted(true);
          setRealRowCount(actualData.current.length);
        }
      } catch (error) {
        console.error('Failed to load more data:', error);
        setDataSourceReadError('Failed to load more data');
      } finally {
        setIsFetchingData(false);
        isFetchingRef.current = false;
      }
    };

    fetchData();
  }, [reader, currentPage, expectedRowTo]);

  /**
   * Initialize data when prop change (new adapter). This is differnt from mount
   * as we do not read the cache. For mount see below.
   */
  useDidUpdate(() => {
    // Rest the sort params
    resetSort();
    // Reset the data view with the new sort params
    reset(null);
  }, [dataAdapterApi]);

  /**
   * Initialize data when component mounts
   */
  useDidMount(() => {
    const init = async () => {
      // First try reading cache, as this will allow quickly showing data
      // before reader is ready. We use non-hook version to access the store
      const cachedDataView = useAppStore.getState().dataViewCache.get(cacheKey);
      if (cachedDataView) {
        localCache.current = cachedDataView;
      }

      // Now let's start with increasingly long operations.
      // First let's see if we can get any row counts from the data adapter.
      if (dataAdapterApi.getRowCount) {
        const knownRowCount = await dataAdapterApi.getRowCount();
        setRealRowCount(knownRowCount);
      } else if (dataAdapterApi.getEstimatedRowCount) {
        const knownEstimatedRowCount = await dataAdapterApi.getEstimatedRowCount();
        setEstimatedRowCount(knownEstimatedRowCount);
      }

      // Now try creating the reader. It will handle errors inside
      await getNewReader(sortParams);
    };
    init();

    // Make sure to cancel the reader when the component unmounts
    return () => {
      reader?.cancel();
    };
  });

  return (
    <Stack className="gap-0 h-full overflow-hidden">
      <DataLoadingOverlay
        title="Opening your file, please wait..."
        onCancel={() => {
          throw new Error('TODO: Implement cancel loading');
        }}
        visible={showLoadingOverlay}
      />
      {dataSourceReadError && (
        <Affix
          position={{ bottom: 16, left: '50%' }}
          style={{ transform: 'translateX(-50%)' }}
          zIndex={50}
        >
          <div className="w-full max-w-md">
            <Stack
              align="center"
              gap={4}
              bg="background-primary"
              className="p-8 pt-4 rounded-2xl shadow-lg"
            >
              <Text c="text-primary" className="text-2xl font-medium">
                {dataSourceReadError}
              </Text>
            </Stack>
          </div>
        </Affix>
      )}
      {useStaleData && (
        <Affix
          position={{ top: 16, left: '50%' }}
          style={{ transform: 'translateX(-50%)' }}
          zIndex={50}
        >
          <Text c="text-primary" className="text-2xl font-medium">
            Showing cached data from page
          </Text>
        </Affix>
      )}
      {showTable && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-3 custom-scroll-hidden pb-6">
            <Table
              data={displayData}
              schema={displaySchema}
              sort={sortParams}
              page={currentPage}
              visible={!!visible}
              onColumnSelectChange={calculateColumnSummary}
              onSort={handleSortAndGetNewReader}
              onRowSelectChange={resetCalculatedValue}
              onCellSelectChange={resetCalculatedValue}
              // TODO:
              onSelectedColsCopy={() => console.warn('Copy selected columns not implemented')}
            />
          </div>
          <Group
            align="center"
            justify="end"
            className="border-t px-2 pt border-borderPrimary-light dark:border-borderPrimary-dark h-[34px]"
          >
            {columnTotal !== null && (
              <Text c="text-primary" className="text-sm">
                {isNumeric ? 'SUM' : 'COUNT'}: {columnTotal}
              </Text>
            )}
            {isColumnCalculating && <Loader size={12} color="text-accent" />}
          </Group>
        </>
      )}
      {showTable && !dataSourceReadError && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <RowCountAndPaginationControl
            rowFrom={displayedRowFrom}
            rowTo={displayedRowTo}
            isSinglePage={isSinglePage}
            isDisabled={isPaginationDisabled}
            rowCount={realOrEstimatedRowCount}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            isEstimatedRowCount={realRowCount === null}
          />
        </div>
      )}
    </Stack>
  );
};
