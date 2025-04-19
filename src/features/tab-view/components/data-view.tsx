import { Table } from '@components/table/table';
import { DataAdapterApi, GetTableDataReturnType } from '@models/data-adapter';
import { useCallback, useEffect, useState } from 'react';
import { setDataTestId } from '@utils/test-id';
import { Center, Group, Loader, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
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
  const [currentPage, setCurrentPage] = useState(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.dataViewPage || 0,
  );
  const [tableData, setTableData] = useState<GetTableDataReturnType>(null);

  /**
   * Local Non-Reactive State
   */

  // Load cached column width once if available
  const [initialColumnSizes] = useState<Record<string, number> | undefined>(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.tableColumnSizes || undefined,
  );

  /**
   * Computed data source state
   */
  const hasActualData = dataAdapter.currentSchema.length > 0 && !dataAdapter.isStale;
  const hasStaleData = dataAdapter.currentSchema.length > 0 && dataAdapter.isStale;
  const hasData = hasActualData || hasStaleData;

  const hasDataSourceError = dataAdapter.dataSourceError !== null;
  const [isFetching] = useDebouncedValue(dataAdapter.isFetchingData, 200);
  const [isSorting] = useDebouncedValue(dataAdapter.isSorting, 200);

  const { totalRowCount, loadedRowCount, isEstimatedRowCount } = dataAdapter.rowCountInfo;
  const rowCountToShow = totalRowCount || loadedRowCount;

  /**
   * Computed State
   */

  // The real requested row range. `expectedRowTo` also tells us how much data we need
  // to fetch to fill the current page.
  const expectedRowFrom = Math.max(0, currentPage * MAX_DATA_VIEW_PAGE_SIZE);
  const expectedRowTo = totalRowCount
    ? // if we know the real row count, we can calculate the expected rowTo precisely
      Math.min(totalRowCount, (currentPage + 1) * MAX_DATA_VIEW_PAGE_SIZE)
    : // if we don't know the real row count, we fall back to the loaded row count
      // assuming the entire page will be filled.
      // If we didn't make a mistake, `totalRowCount` should always exist if we've exhausted
      // the data source, so we should not request more than available more than once.
      (currentPage + 1) * MAX_DATA_VIEW_PAGE_SIZE;

  const isSinglePage = rowCountToShow <= MAX_DATA_VIEW_PAGE_SIZE;

  // Now get the data to be used by the table
  useEffect(
    () => {
      const newData = dataAdapter.getTableData(expectedRowFrom, expectedRowTo);
      setTableData(newData);
    },
    // There is no point in getting data again if the data version
    // has not changed. This is important for performance.
    [dataAdapter.dataSourceVersion, dataAdapter.getTableData, expectedRowFrom, expectedRowTo],
  );

  // Whether we should show a full loading overlay, i.e. we have nothing, even stale to show
  const [showLoadingOverlay] = useDebouncedValue(
    (tableData === null || !hasData) && !isSorting && isFetching && !hasDataSourceError,
    200,
  );

  // Whether to show error overlay (that's when even stale data is not available
  // and we have an error)
  const showErrorOverlay = (tableData === null || !hasData) && hasDataSourceError;
  const showMessageOverlay =
    (tableData === null || !hasData) && !isSorting && !isFetching && !hasDataSourceError;

  const displayData = tableData?.data;
  // The actual row range to show in the table. It may be different from the expected row range
  const displayedRowFrom = tableData?.rowFrom || expectedRowFrom;
  const displayedRowTo = tableData?.rowTo || expectedRowTo;

  // Whether we should show the table, even if with no rows.
  // If we didn't make a mistke, if `hasData` is true then `tableData`
  // is not null. But we are using a stronger check to be sure.
  const showTable = displayData !== undefined && hasData;

  // Should we allow pagination? We allow continuing paginating even
  // while data is loading (but not sorting), and we disable the buttons
  // if we are in error state
  const isPaginationDisabled =
    hasData && !isSorting && !hasDataSourceError && !dataAdapter.dataSourceExhausted;

  /**
   * Exvent handlers
   */
  const setAndCacheDataPage = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    updateTabDataViewDataPageCache(tabId, newPage);
  }, []);

  const handleNextPage = useCallback(() => {
    const nextPage = currentPage + 1;

    // Check we are not accidentally switch past the end of the data,
    const newExpectedRowFrom = nextPage * MAX_DATA_VIEW_PAGE_SIZE;
    if (newExpectedRowFrom >= rowCountToShow) {
      return;
    }

    setAndCacheDataPage(nextPage);
  }, [currentPage, rowCountToShow]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      setAndCacheDataPage(prevPage);
    }
  }, []);

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
              We are sorry, but we encountered an errors while
              {tabType === 'data-source' ? 'opening your file' : 'running your query'}:
            </Text>
            <Text c="text-secondary" className="text-lg font-medium">
              {dataAdapter.dataSourceError ||
                'Internal error creating data adapter. Please report this issue.'}
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
              <Text c="text-secondary">Your query results will be displayed here.</Text>
            </Stack>
          </Center>
        </>
      )}
      {showTable && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-3 custom-scroll-hidden pb-6">
            <Table
              data={displayData}
              schema={dataAdapter.currentSchema}
              sort={dataAdapter.sort}
              page={currentPage}
              visible={!!active}
              initialCoulmnSizes={initialColumnSizes}
              onColumnSelectChange={calculateColumnSummary}
              onSort={
                hasDataSourceError || dataAdapter.disableSort
                  ? undefined
                  : handleSortAndGetNewReader
              }
              onRowSelectChange={resetColumnAggregate}
              onCellSelectChange={resetColumnAggregate}
              onSelectedColsCopy={hasDataSourceError ? undefined : handleCopySelectedColumns}
              onColumnResizeChange={(columnSizes) =>
                updateTabDataViewColumnSizesCache(tabId, columnSizes)
              }
            />
          </div>
          <Group
            align="center"
            justify="end"
            className="border-t px-2 pt border-borderPrimary-light dark:border-borderPrimary-dark h-[34px]"
          >
            {columnTotal !== null && (
              <Text c="text-primary" className="text-sm">
                {columnAggType.toUpperCase()}: {columnTotal}
              </Text>
            )}
            {isColumnAggCalculating && <Loader size={12} color="text-accent" />}
          </Group>
        </>
      )}
      {showTable && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <RowCountAndPaginationControl
            rowFrom={displayedRowFrom + 1}
            rowTo={displayedRowTo}
            isSinglePage={isSinglePage}
            isDisabled={isPaginationDisabled}
            rowCount={rowCountToShow}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            isEstimatedRowCount={isEstimatedRowCount}
          />
        </div>
      )}
    </Stack>
  );
};
