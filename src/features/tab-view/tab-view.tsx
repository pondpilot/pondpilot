import { memo, useCallback, useEffect, useMemo } from 'react';

import { Allotment } from 'allotment';
import { useAppContext } from '@features/app-context';
import { useClipboard, useDebouncedState, useHotkeys } from '@mantine/hooks';
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
import { formatNumber } from '@utils/helpers';
import { Table as ApacheTable, tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { useAllTabsQuery, useTabQuery, useUpdateTabMutation } from '@store/app-idb-store';
import { useAppStore } from '@store/app-store';
import { PaginationControl, TableLoadingOverlay } from './components';
import { useTablePaginationSort } from './hooks/useTablePaginationSort';
import { useTableExport } from './hooks/useTableExport';
import { useColumnSummary } from './hooks';
import { setDataTestId } from '@utils/test-id';

export const TabView = memo(({ id, active }: { id: string; active: boolean }) => {
  const { data: tab } = useTabQuery(id);
  const { data: tabs } = useAllTabsQuery();
  const { mutateAsync: updateTab } = useUpdateTabMutation();

  /**
   * Common hooks
   */
  const { onCancelQuery, executeQuery, runQuery } = useAppContext();
  const { onNextPage, onPrevPage, handleSort } = useTablePaginationSort(tab);
  const { handleCopyToClipboard, exportTableToCSV } = useTableExport();
  const { showSuccess } = useAppNotifications();
  const clipboard = useClipboard();
  const { calculateColumnSummary, columnTotal, isCalculating, isNumericType, resetTotal } =
    useColumnSummary(tab);
  const views = useAppStore((state) => state.views);

  const queryResults: ApacheTable<any> | null | undefined = tab?.dataView.data
    ? tableFromIPC(tab?.dataView.data)
    : null;
  const queryRunning = tab?.query.state === 'fetching';
  const queryView = tab?.type === 'query';

  const { editorPaneHeight = 0, dataViewPaneHeight = 0 } = tab?.layout ?? {};
  const rowCount = tab?.dataView.rowCount || 0;
  const limit = 100;
  const currentPage = tab?.pagination.page ?? 1;

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
          `SELECT ${selectedCols.join(', ')} FROM (${tab?.query?.originalQuery?.replaceAll(';', '')})`,
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
    [active, tab?.query.originalQuery],
  );

  const setPanelSize = ([editor, table]: number[]) => {
    if (tab) {
      updateTab({
        id: tab.id,
        layout: {
          ...tab.layout,
          editorPaneHeight: editor,
          dataViewPaneHeight: table,
        },
      });
    }
  };

  useHotkeys([['Alt+Q', onCancel]]);

  useEffect(() => {
    if (queryRunning) {
      setDebouncedLoading(true);
    } else {
      setDebouncedLoading(false);
    }
  }, [queryRunning]);

  useEffect(() => {
    const view = views.find((v) => v.sourceId === tab?.sourceId);
    if (!view || !tab) return;

    const setData = async () => {
      await updateTab({
        state: 'fetching',
        id: tab.id,
      });
      const result = await runQuery({
        query: `SELECT * FROM ${view.view_name}`,
      });

      if (result) {
        await updateTab({
          id: tab.id,
          query: {
            originalQuery: result.originalQuery,
            state: 'success',
          },
          dataView: {
            data: result.data,
            rowCount: result.pagination,
          },
        });
      }
    };
    if (tab.type === 'file' && !tab.dataView.data) {
      setData();
    }
  }, [tab?.id]);

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[editorPaneHeight, dataViewPaneHeight]}
      >
        {queryView && (
          <Allotment.Pane preferredSize={editorPaneHeight} minSize={200}>
            <QueryEditor
              columnsCount={convertedTable.columns.length}
              rowsCount={rowCount}
              id={tab.id}
              active={active}
            />
          </Allotment.Pane>
        )}
        <Allotment.Pane preferredSize={dataViewPaneHeight} minSize={120}>
          {/* // TODO: Create DataView component */}
          {!hasTableData && !queryRunning && active && (
            <Center className="h-full font-bold">
              <Stack align="center" c="icon-default" gap={4}>
                <IconClipboardSmile size={32} stroke={1} />
                <Text c="text-secondary">Your query results will be displayed here.</Text>
              </Stack>
            </Center>
          )}
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
                        <Text c="text-secondary" className="text-sm font-medium cursor-not-allowed">
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
                    {convertedTable.columns.length} columns, {formatNumber(rowCount)} rows
                  </Text>
                )}
              </Group>
            )}

            <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
              <Table
                data={convertedTable.data}
                columns={convertedTable.columns}
                onSort={handleSort}
                sort={tab?.sort}
                page={currentPage}
                onSelectedColsCopy={onSelectedColsCopy}
                onColumnSelectChange={calculateColumnSummary}
                onRowSelectChange={resetTotal}
                onCellSelectChange={resetTotal}
                visible={!!active}
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
        </Allotment.Pane>
      </Allotment>

      {hasTableData && !isSinglePage && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <PaginationControl
            currentPage={currentPage}
            limit={limit}
            rowCount={rowCount}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
          />
        </div>
      )}
    </div>
  );
});

TabView.displayName = 'TabView';
