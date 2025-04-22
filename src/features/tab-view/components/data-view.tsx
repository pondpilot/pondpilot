import { Table } from '@components/table/table';
import { DataAdapterApi, DataTableSlice, GetDataTableSliceReturnType } from '@models/data-adapter';
import { useCallback, useRef, useState } from 'react';
import { setDataTestId } from '@utils/test-id';
import { Center, Group, Loader, Stack, Text } from '@mantine/core';
import { useDebouncedValue, useDidUpdate } from '@mantine/hooks';
import { RowCountAndPaginationControl } from '@components/row-count-and-pagination-control/row-count-and-pagination-control';
import { DataLoadingOverlay } from '@components/data-loading-overlay';
import { DBColumn } from '@models/db';
import { notifications } from '@mantine/notifications';
import { showSuccess } from '@components/app-notifications';
import { copyToClipboard } from '@utils/clipboard';
import { MAX_DATA_VIEW_PAGE_SIZE, TabId, TabType } from '@models/tab';
import { IconClipboardSmile } from '@tabler/icons-react';
import { useAppStore } from '@store/app-store';
import {
  updateTabDataViewColumnSizesCache,
  updateTabDataViewDataPageCache,
} from '@controllers/tab';
import { formatStringsAsMDList } from '@utils/pretty';
import { formatNumber } from '@utils/helpers';
import { useColumnSummary } from '../hooks';

interface DataViewProps {
  /**
   * Inactive data views disable all hotkeys and UI interactions.
   */
  active: boolean;

  dataAdapter: DataAdapterApi;
  tabId: TabId;
  tabType: TabType;
}

export const DataView = ({ active, dataAdapter, tabId, tabType }: DataViewProps) => {
  /**
   * Helpful hooks
   */
  const {
    calculateColumnSummary,
    columnTotal,
    columnAggType,
    resetTotal: resetColumnAggregate,
    isLoading: isColumnAggCalculating,
  } = useColumnSummary(dataAdapter);

  /**
   * Local Reactive State
   */

  // This the page we ask the data adapter to fetch.
  const [requestedPage, setRequestedPage] = useState(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.dataViewPage || 0,
  );

  // This is the actual data slice we have from the data adapter.
  const [dataSlice, setDataSlice] = useState<DataTableSlice | null>(null);

  /**
   * Local Non-Reactive State
   */

  // Load cached column width once if available on mount
  const [initialColumnSizes] = useState<Record<string, number> | undefined>(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.tableColumnSizes || undefined,
  );

  // Used to reset requested page when data is changed without unmounting
  const lastDataSourceVersion = useRef<number>(dataAdapter.dataVersion);

  /**
   * Computed data source state
   */
  const hasActualData = dataAdapter.currentSchema.length > 0 && !dataAdapter.isStale;
  const hasStaleData = dataAdapter.currentSchema.length > 0 && dataAdapter.isStale;
  const hasData = hasActualData || hasStaleData;

  const hasDataSourceError = dataAdapter.dataSourceError.length > 0;

  // Make a clever debounced value of `isFetching` that waits to
  // turn ON, but immediately turns OFF based on dataAdapter.isFetchingData
  const [isDebouncedFetching] = useDebouncedValue(dataAdapter.isFetchingData, 200);
  const isFetching = isDebouncedFetching && dataAdapter.isFetchingData;

  // Same as fetching, only debounce one way
  const [isDebouncedSorting] = useDebouncedValue(dataAdapter.isSorting, 200);
  const isSorting = isDebouncedSorting && dataAdapter.isSorting;

  const { realRowCount, estimatedRowCount, availableRowCount } = dataAdapter.rowCountInfo;
  const isEstimatedRowCount = realRowCount === null;
  const rowCountToShow = realRowCount || estimatedRowCount || availableRowCount;

  // The real requested row range. `expectedRowTo` also tells us how much data we need
  // to fetch to fill the current page.
  const expectedRowFrom = realRowCount
    ? // It should be impossible to request a row starting at real row count index
      Math.min(
        realRowCount - MAX_DATA_VIEW_PAGE_SIZE,
        Math.max(0, requestedPage * MAX_DATA_VIEW_PAGE_SIZE),
      )
    : Math.max(0, requestedPage * MAX_DATA_VIEW_PAGE_SIZE);
  const expectedRowTo = realRowCount
    ? // if we know the real row count, we can calculate the expected rowTo precisely
      Math.min(realRowCount, (requestedPage + 1) * MAX_DATA_VIEW_PAGE_SIZE)
    : // if we don't know the real row count, we will continue trying to ask up
      // to the end of the target page.
      // If we didn't make a mistake, `realRowCount` should always exist if we've exhausted
      // the data source, so we should not request more than available more than once.
      (requestedPage + 1) * MAX_DATA_VIEW_PAGE_SIZE;

  // If we do not know even the estimated row count, `rowCountToShow` will show how many
  // is loaded, but we still want to show pagination since we allowing to
  // try to fetch more data.
  const isSinglePage = Math.max(expectedRowTo, rowCountToShow) <= MAX_DATA_VIEW_PAGE_SIZE;

  // Now get the data to be used by the table
  useDidUpdate(
    () => {
      let newData: GetDataTableSliceReturnType = null;

      if (dataAdapter.dataReadCancelled) {
        // Set whatever is the closest fully visible page
        // to the requested page and avoid reading data again this time
        setAndCacheDataPage(
          Math.min(
            requestedPage,
            Math.floor(
              (dataSlice
                ? dataSlice.rowOffset + dataSlice.data.length
                : dataAdapter.rowCountInfo.availableRowCount) / MAX_DATA_VIEW_PAGE_SIZE,
            ),
          ),
        );

        dataAdapter.ackDataReadCancelled();
        return;
      }

      if (lastDataSourceVersion.current !== dataAdapter.dataSourceVersion) {
        // Instead of requesting data on the next render, reset the page to 0.
        // This should work fine for initial cached page, since
        // this is a useDidUpdate hook and should not fire on mount
        lastDataSourceVersion.current = dataAdapter.dataSourceVersion;
        setAndCacheDataPage(0);

        // Request the first page of data
        newData = dataAdapter.getDataTableSlice(0, MAX_DATA_VIEW_PAGE_SIZE);
      } else {
        newData = dataAdapter.getDataTableSlice(expectedRowFrom, expectedRowTo);
      }
      setDataSlice(newData);
    },
    // There is no point in getting data again if the data version
    // has not changed. This is important for performance.
    [
      dataAdapter.dataVersion,
      dataAdapter.dataSourceVersion,
      dataAdapter.getDataTableSlice,
      dataAdapter.dataReadCancelled,
      dataAdapter.ackDataReadCancelled,
      expectedRowFrom,
      expectedRowTo,
    ],
  );

  // Whether we should show a full loading overlay, i.e. we have nothing, even stale to show
  const [showLoadingOverlay] = useDebouncedValue(
    (dataSlice === null || !hasData) && !isSorting && isFetching && !hasDataSourceError,
    200,
  );

  // Whether to show error overlay (that's when even stale data is not available
  // and we have an error)
  const showErrorOverlay = (dataSlice === null || !hasData) && hasDataSourceError;
  const showMessageOverlay =
    (dataSlice === null || !hasData) && !isSorting && !isFetching && !hasDataSourceError;

  // Whether we should show the table, even if with no rows.
  // If we didn't make a mistke, if `hasData` is true then `tableData`
  // is not null. But we are using a stronger check to be sure.
  const showTableAndPagination = dataSlice !== null && hasData;

  // The actual row range to show in pagination. It may be different from the expected row range.
  // If we have 0 rows, than return 0, but if we have rows, we show 1-indexed range.
  const displayedRowFrom = dataSlice
    ? dataSlice.data.length > 0
      ? dataSlice.rowOffset + 1
      : 0
    : 0;
  const displayedRowTo = dataSlice ? dataSlice.rowOffset + dataSlice.data.length : 0;

  // Should we allow pagination? We allow continuing paginating even
  // while data is loading (but not sorting), and we disable the buttons
  // if we are in error state
  const isPaginationDisabled = !hasData || isSorting;

  const hasPrevPage = requestedPage > 0;
  const nextPage = requestedPage + 1;
  const hasNextPage = realRowCount ? nextPage * MAX_DATA_VIEW_PAGE_SIZE < realRowCount : true;

  /**
   * Exvent handlers
   */
  const setAndCacheDataPage = useCallback((newPage: number) => {
    setRequestedPage(newPage);
    updateTabDataViewDataPageCache(tabId, newPage);
  }, []);

  const handleNextPage = useCallback(() => {
    if (hasNextPage) {
      setAndCacheDataPage(nextPage);
    }
  }, [hasNextPage, nextPage]);

  const handlePrevPage = useCallback(() => {
    if (requestedPage > 0) {
      const prevPage = requestedPage - 1;
      setAndCacheDataPage(prevPage);
    }
  }, [requestedPage]);

  /**
   * Handle sorting
   */
  const handleSortAndGetNewReader = useCallback(
    (sortField: DBColumn['name']) => {
      dataAdapter.toggleColumnSort(sortField);
    },
    [dataAdapter.toggleColumnSort],
  );

  /**
   * Handle copy selected columns
   */
  const handleCopySelectedColumns = useCallback(
    async (selectedCols: DBColumn[]) => {
      // We do not want to call API if no columns are selected
      if (!selectedCols.length) {
        return;
      }

      const notificationId = showSuccess({
        title: 'Copying selected columns to clipboard...',
        message: '',
        loading: true,
        autoClose: false,
        color: 'text-accent',
      });
      try {
        const data = await dataAdapter.getAllTableData(selectedCols);

        const headers = selectedCols.map((col) => col.name).join('\t');
        const rows = data.map((row) => selectedCols.map((col) => row[col.name] ?? '').join('\t'));
        const tableText = [headers, ...rows].join('\n');
        await copyToClipboard(tableText);

        notifications.update({
          id: notificationId,
          title: 'Selected columns copied to clipboard',
          message: '',
          loading: false,
          autoClose: 800,
        });
      } catch (error) {
        const autoCancelled = error instanceof DOMException ? error.name === 'Cancelled' : false;
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (autoCancelled) {
          notifications.update({
            id: notificationId,
            title: 'Cancelled',
            message,
            loading: false,
            autoClose: 800,
            color: 'text-warning',
          });
          return;
        }

        notifications.update({
          id: notificationId,
          title: 'Failed to copy selected columns to clipboard',
          message,
          loading: false,
          autoClose: 5000,
          color: 'red',
        });
      }
    },
    [dataAdapter.getAllTableData],
  );

  const onColumnResizeChange = useCallback(
    (columnSizes: Record<string, number>) => {
      updateTabDataViewColumnSizesCache(tabId, columnSizes);
    },
    [tabId],
  );

  // Show dev only jump to row in pagination
  let handleOnJumpToRow;
  if (import.meta.env.DEV) {
    handleOnJumpToRow = useCallback(
      (rowNumber: number) => setAndCacheDataPage(Math.floor(rowNumber / MAX_DATA_VIEW_PAGE_SIZE)),
      [],
    );
  }

  return (
    <Stack className="gap-0 h-full overflow-hidden">
      {/* Loading overlay */}
      <DataLoadingOverlay
        title={
          tabType === 'data-source' ? 'Opening your file, please wait...' : 'Running your query...'
        }
        onCancel={dataAdapter.cancelDataRead}
        visible={showLoadingOverlay}
      />
      {/* Error overlay */}
      {showErrorOverlay && (
        <>
          <Stack align="center" gap={4} bg="background-primary" className="p-8 pt-4 rounded-2xl">
            <Text c="text-primary" className="text-2xl font-medium">
              We are sorry, but we encountered errors while
              {tabType === 'data-source' ? ' opening your file' : ' running your query'}:
            </Text>
            <Text c="text-secondary" className="text-lg font-medium">
              {formatStringsAsMDList(dataAdapter.dataSourceError)}
            </Text>
          </Stack>
        </>
      )}
      {/* Message overlay, for scripts */}
      {showMessageOverlay && (
        <>
          <Center className="h-full font-bold">
            <Stack align="center" c="icon-default" gap={4}>
              <IconClipboardSmile size={32} stroke={1} />
              <Text c="text-secondary">
                {tabType === 'data-source'
                  ? 'Your data will be displayed here.'
                  : 'Your query results will be displayed here.'}
              </Text>
            </Stack>
          </Center>
        </>
      )}
      {showTableAndPagination && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-3 custom-scroll-hidden pb-6">
            <Table
              dataSlice={dataSlice}
              schema={dataAdapter.currentSchema}
              sort={dataAdapter.sort}
              visible={!!active}
              initialColumnSizes={initialColumnSizes}
              onColumnSelectChange={calculateColumnSummary}
              onSort={dataAdapter.disableSort ? undefined : handleSortAndGetNewReader}
              onRowSelectChange={resetColumnAggregate}
              onCellSelectChange={resetColumnAggregate}
              onSelectedColsCopy={hasDataSourceError ? undefined : handleCopySelectedColumns}
              onColumnResizeChange={onColumnResizeChange}
            />
          </div>
          <Group
            align="center"
            justify="end"
            className="border-t px-2 pt border-borderPrimary-light dark:border-borderPrimary-dark h-[34px]"
          >
            {columnTotal !== null && (
              <Text c="text-primary" className="text-sm">
                {columnAggType.toUpperCase()}: {formatNumber(columnTotal)}
              </Text>
            )}
            {isColumnAggCalculating && <Loader size={12} color="text-accent" />}
          </Group>
        </>
      )}
      {showTableAndPagination && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <RowCountAndPaginationControl
            rowFrom={displayedRowFrom}
            rowTo={displayedRowTo}
            isSinglePage={isSinglePage}
            isDisabled={isPaginationDisabled}
            hasPrevPage={hasPrevPage}
            hasNextPage={hasNextPage}
            rowCount={rowCountToShow}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            isEstimatedRowCount={isEstimatedRowCount}
            onJumpToRow={handleOnJumpToRow}
          />
        </div>
      )}
    </Stack>
  );
};
