import { memo, useCallback, useEffect, useMemo } from 'react';

import { Allotment } from 'allotment';
import { useAppContext } from '@features/app-context';
import { useAppStore } from '@store/app-store';
import { useClipboard, useDebouncedState, useHotkeys, useLocalStorage } from '@mantine/hooks';
import { usePaginationStore } from '@store/pagination-store';
import { QueryEditor } from '@features/query-editor';
import { getArrowTableSchema } from '@utils/arrow/helpers';
import {
  ActionIcon,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { Table } from '@components/table/table';
import { IconChevronDown, IconClipboardSmile, IconCopy } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { Table as ApacheTable } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { PaginationControl, StartGuide, TableLoadingOverlay } from './components';
import { useTableSort } from './hooks/useTablePaginationSort';
import { useTableExport } from './hooks/useTableExport';
import { useColumnSummary } from './hooks';

export const DataViewer = memo(() => {
  /**
   * Common hooks
   */
  const { onCancelQuery, executeQuery } = useAppContext();
  const [panelSize, setPanelSize] = useLocalStorage<number[]>({ key: 'main-panel-sizes' });
  const { onNextPage, onPrevPage, handleSort } = useTableSort();
  const { handleCopyToClipboard, exportTableToCSV } = useTableExport();
  const { showSuccess } = useAppNotifications();
  const clipboard = useClipboard();
  const { calculateColumnSummary, columnTotal, isCalculating, isNumericType, resetTotal } =
    useColumnSummary();

  /**
   * Store access
   */
  const queryResults: ApacheTable<any> | null = useAppStore((state) => state.queryResults);
  const queryView = useAppStore((state) => state.queryView);
  const queryRunning = useAppStore((state) => state.queryRunning);
  const activeTab = useAppStore((state) => state.activeTab);
  const originalQuery = useAppStore((state) => state.originalQuery);

  const rowCount = usePaginationStore((state) => state.rowsCount);
  const limit = usePaginationStore((state) => state.limit);
  const currentPage = usePaginationStore((state) => state.currentPage);
  const sort = usePaginationStore((state) => state.sort);

  /**
   * Local state
   */
  const [debouncedLoading, setDebouncedLoading] = useDebouncedState(false, 1000);

  const onCancel = () => onCancelQuery();

  const convertedTable = useMemo(() => {
    if (!queryResults || queryResults.numRows === 0) return { columns: [], data: [] };

    const data = queryResults.toArray().map((row) => row.toJSON());
    const columns = getArrowTableSchema(queryResults) || [];

    return { columns, data };
  }, [queryResults]);

  /**
   * Consts
   */
  const isSinglePage = rowCount <= limit;
  const startItem = rowCount > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = Math.min(currentPage * limit, rowCount);
  const outOf =
    rowCount > 0
      ? !isSinglePage
        ? `${startItem}-${endItem} out of ${rowCount}`
        : `${endItem} out of ${rowCount}`
      : 'No data';
  const hasTableData = !!convertedTable.data.length && !!convertedTable.columns.length;

  const onSelectedColsCopy = useCallback(
    async (cols: Record<string, boolean>) => {
      const notificationId = showSuccess({
        title: 'Copying selected columns to clipboard...',
        message: '',
        loading: true,
        autoClose: false,
        color: 'text-accent',
      });

      try {
        const selectedCols = Object.keys(cols)
          .filter((col) => cols[col])
          .map((col) => `"${col}"`);

        const result: ApacheTable<any> = await executeQuery(
          `SELECT ${selectedCols.join(', ')} FROM (${originalQuery})`,
        );

        const data = result.toArray().map((row) => row.toJSON());
        const columns = getArrowTableSchema(result) || [];

        if (Array.isArray(data) && Array.isArray(columns)) {
          const headers = columns.map((col) => col.name).join('\t');
          const rows = data.map((row) => columns.map((col) => row[col.name] ?? '').join('\t'));
          const tableText = [headers, ...rows].join('\n');

          clipboard.copy(tableText);
        }
        notifications.update({
          id: notificationId,
          title: 'Selected columns copied to clipboard',
          message: '',
          loading: false,
          autoClose: 800,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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
    [activeTab, originalQuery],
  );
  useHotkeys([['Alt+Q', onCancel]]);
  useEffect(() => {
    if (queryRunning) {
      setDebouncedLoading(true);
    } else {
      setDebouncedLoading(false);
    }
  }, [queryRunning]);

  return (
    <div className="h-full relative">
      <Allotment vertical onDragEnd={setPanelSize} defaultSizes={panelSize}>
        {queryView && (
          <Allotment.Pane preferredSize={panelSize?.[0]} minSize={200}>
            <QueryEditor
              columnsCount={convertedTable.columns.length}
              rowsCount={rowCount}
              hasTableData={hasTableData}
            />
          </Allotment.Pane>
        )}
        <Allotment.Pane preferredSize={panelSize?.[1]} minSize={120}>
          {!hasTableData && !queryRunning && activeTab && (
            <Center className="h-full font-bold">
              <Stack align="center" c="icon-default" gap={4}>
                <IconClipboardSmile size={32} stroke={1} />
                <Text c="text-secondary">Your query results will be displayed here.</Text>
              </Stack>
            </Center>
          )}
          {activeTab ? (
            <div className="flex flex-col h-full">
              <TableLoadingOverlay
                queryView={queryView}
                onCancel={onCancel}
                visible={hasTableData ? debouncedLoading : queryRunning}
              />
              {hasTableData && (
                <Group
                  justify="space-between"
                  className={cn('h-7 mt-4 mb-2 px-3', queryView && 'mt-3')}
                >
                  {queryView ? (
                    <>
                      <Group>
                        <Text c="text-primary" className="text-sm font-medium cursor-pointer">
                          Result
                        </Text>
                        <Tooltip label="Soon">
                          <Text
                            c="text-secondary"
                            className="text-sm font-medium cursor-not-allowed"
                          >
                            Metadata View
                          </Text>
                        </Tooltip>
                      </Group>
                      <Group>
                        <ActionIcon size={16} onClick={() => handleCopyToClipboard(convertedTable)}>
                          <IconCopy />
                        </ActionIcon>
                        <Menu position="bottom">
                          <Menu.Target>
                            <Button
                              color="background-tertiary"
                              c="text-primary"
                              rightSection={
                                <IconChevronDown
                                  className="text-iconDefault-light dark:text-iconDefault-dark"
                                  size={20}
                                />
                              }
                            >
                              Export
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={exportTableToCSV}>
                              Comma-Separated Values (.csv)
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </>
                  ) : (
                    <Text c="text-secondary" className="text-sm font-medium">
                      {convertedTable.columns.length} columns, {rowCount} rows
                    </Text>
                  )}
                </Group>
              )}

              <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
                <Table
                  data={convertedTable.data}
                  columns={convertedTable.columns}
                  onSort={handleSort}
                  sort={sort}
                  onSelectedColsCopy={onSelectedColsCopy}
                  onColumnSelectChange={calculateColumnSummary}
                  onRowSelectChange={resetTotal}
                  onCellSelectChange={resetTotal}
                />
              </div>

              <Group
                align="center"
                justify="end"
                className="border-t px-2 pt border-borderPrimary-light dark:border-borderPrimary-dark h-[34px]"
              >
                {columnTotal !== null && (
                  <Text c="text-primary" className="text-sm">
                    {isNumericType ? 'SUM' : 'COUNT'}: {columnTotal}
                  </Text>
                )}
                {isCalculating && <Loader size={12} color="text-accent" />}
              </Group>
            </div>
          ) : (
            <StartGuide />
          )}
        </Allotment.Pane>
      </Allotment>

      {hasTableData && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <PaginationControl
            isSinglePage={isSinglePage}
            outOf={outOf}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            data-testid="data-table-pagination-control"
          />
        </div>
      )}
    </div>
  );
});

DataViewer.displayName = 'DataViewer';
