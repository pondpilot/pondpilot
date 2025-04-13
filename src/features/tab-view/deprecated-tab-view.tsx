import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { Allotment } from 'allotment';
import { useAppContext } from '@features/app-context';
import { useClipboard, useDebouncedState, useHotkeys } from '@mantine/hooks';
import { QueryEditor } from '@features/query-editor';
import { getArrowTableSchema } from '@utils/arrow/schema';
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
import { Table as ApacheTable, AsyncRecordBatchStreamReader } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { setDataTestId } from '@utils/test-id';
import { AnyTab, FileDataSourceTab } from '@models/tab';
import {
  updateScriptTabEditorPaneHeight,
  updateTabDataViewLayout,
  useAppStore,
} from '@store/app-store';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { getFlatFileDataAdapterApi } from '@controllers/db/data-view';
import { dbApiProxi } from '@features/app-context/db-worker';
import { PaginationControl, TableLoadingOverlay } from './components';
import { useTableExport } from './hooks/useTableExport';
import { useColumnSummary } from './hooks';

interface TabViewProps {
  tab: AnyTab;
  active: boolean;
}

export const TabView = memo(({ tab, active }: TabViewProps) => {
  /**
   * Common hooks
   */
  const { onCancelQuery, executeQuery } = useAppContext();
  // const { onNextPage, onPrevPage, handleSort } = useTablePaginationSort(tab);
  const { handleCopyToClipboard, exportTableToCSV } = useTableExport();
  const { showSuccess } = useAppNotifications();
  const clipboard = useClipboard();
  // TODO: Pass the data to calculateColumnSummary
  const { calculateColumnSummary, columnTotal, isCalculating, isNumericType, resetTotal } =
    useColumnSummary(undefined);

  // TODO - thefollowing should all move to data view component, only the dataViewData object should be passed
  // Also, we should use different Tab components for 3 types of tabs we have, as they
  // all fetch/create dataViews differently

  const { conn } = useInitializedDuckDBConnection();
  const persistentTab: FileDataSourceTab | null =
    tab.type === 'data-source' && tab.dataSourceType === 'file' ? tab : null;
  const dataSource = useAppStore((state) => state.dataSources.get(tab.dataSourceId));
  const sourceFile = useAppStore((state) =>
    dataSource?.fileSourceId ? state.localEntries.get(dataSource?.fileSourceId) : null,
  );

  const dataViewAdapter = useMemo(
    () =>
      dataSource && dataSource.type !== 'attached-db' && sourceFile
        ? getFlatFileDataAdapterApi(dataSource, tab.id, sourceFile)
        : null,
    [dataSource],
  );
  const [dataViewReader, setReader] = useState<AsyncRecordBatchStreamReader<any> | null>(null);
  const [isQueryRunning, setQueryRunning] = useState<boolean>(false);
  const [fetchedData, setFetchedData] = useState<ApacheTable<any> | null>(null);

  // TODO - this should only be part of the scipt tab view and be cleaned up
  const runScriptQuery = useCallback(
    async (query: string) => {
      setQueryRunning(true);
      const { data } = await dbApiProxi.runQuery({ query, conn });
      setFetchedData(data);
      setQueryRunning(false);
    },
    [conn],
  );

  // Create a new reader on first load. The rest should be updated on sorting etc.
  useEffect(() => {
    if (!dataViewAdapter || !conn) {
      return;
    }

    (async () => {
      const reader = await dataViewAdapter.getReader(conn, []);
      setQueryRunning(true);

      // Fetch the first batch
      const batch = await reader.next();

      if (batch.value) {
        setFetchedData(batch.value as ApacheTable<any>);
        setQueryRunning(false);
      }

      setReader(reader);
    })();
  }, [dataViewAdapter, conn]);

  const isSctiptTab = tab.type === 'script';

  const editorPaneHeight = tab.type === 'script' ? tab.editorPaneHeight : 0;
  const { dataViewPaneHeight } = tab.dataViewLayout;

  // TODO: Get rowCount using data view adapter if available
  const rowCount = 0;
  const limit = 100;
  const currentPage = 1;

  /**
   * Local state
   */
  const [debouncedLoading, setDebouncedLoading] = useDebouncedState(false, 1000);

  const onCancel = () => onCancelQuery();

  // TODO: this should not happen this way. schema should be part of the data adapter
  // and be fetched separately. conversion of table to JSON and storing in cache should
  // be part of handlers
  const convertedTable = useMemo(() => {
    if (!fetchedData) {
      return { columns: [], data: [] };
    }

    const data = fetchedData.toArray().map((row) => row.toJSON());
    const columns = getArrowTableSchema(fetchedData) || [];

    return { columns, data };
  }, [fetchedData]);

  /**
   * Consts
   */
  const isSinglePage = rowCount <= limit;
  // const hasTableData = !!convertedTable.data.length && !!convertedTable.columns.length;
  const hasTableData = !!convertedTable.columns.length;

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
          // `SELECT ${selectedCols.join(', ')} FROM (${tab?.query?.originalQuery?.replaceAll(';', '')})`,
          // TODO: Call duckdb to get the data
          'SELECT ...',
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
    [active, tab],
  );

  const setPanelSize = ([editor, table]: number[]) => {
    // All tabs have data view layout
    updateTabDataViewLayout(tab, {
      ...tab.dataViewLayout,
      dataViewPaneHeight: table,
    });

    if (tab.type === 'script') {
      // Also update the editor pane height
      updateScriptTabEditorPaneHeight(tab, editor);
    }
  };

  useHotkeys([['Alt+Q', onCancel]]);

  useEffect(() => {
    if (isQueryRunning) {
      setDebouncedLoading(true);
    } else {
      setDebouncedLoading(false);
    }
  }, [isQueryRunning]);

  useEffect(() => {
    // const view = views.find((v) => v.sourceId === tab?.sourceId);
    // TODO: Currently, this functionality may not be needed due to the fact that data can be obtained directly from the state during initialization
    // const setData = async () => {
    //   await updateTab({
    //     state: 'fetching',
    //     id: tab.id,
    //   });
    //   const result = await runQuery({
    //     query: `SELECT * FROM ${view.view_name}`,
    //   });
    //   if (result) {
    //     await updateTab({
    //       id: tab.id,
    //       query: {
    //         originalQuery: result.originalQuery,
    //         state: 'success',
    //       },
    //       dataView: {
    //         data: result.data,
    //         rowCount: result.pagination,
    //       },
    //     });
    //   }
    // };
    // if (tab.type === 'file' && !tab.dataView.data) {
    //   setData();
    // }
  }, [tab?.id]);

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[editorPaneHeight, dataViewPaneHeight]}
      >
        {isSctiptTab && tab.sqlScriptId && (
          <Allotment.Pane preferredSize={editorPaneHeight} minSize={200}>
            <QueryEditor
              columnsCount={convertedTable.columns.length}
              rowsCount={rowCount}
              id={tab.sqlScriptId}
              active={active}
              runScriptQuery={runScriptQuery}
            />
          </Allotment.Pane>
        )}
        <Allotment.Pane preferredSize={dataViewPaneHeight} minSize={120}>
          {/* // TODO: Create DataView component */}
          {!hasTableData && !isQueryRunning && active && (
            <Center className="h-full font-bold">
              <Stack align="center" c="icon-default" gap={4}>
                <IconClipboardSmile size={32} stroke={1} />
                <Text c="text-secondary">Your query results will be displayed here.</Text>
              </Stack>
            </Center>
          )}
          <div className="flex flex-col h-full">
            <TableLoadingOverlay
              queryView={isSctiptTab}
              onCancel={onCancel}
              visible={hasTableData ? debouncedLoading : isQueryRunning}
            />
            {hasTableData && (
              <Group
                justify="space-between"
                className={cn('h-7 mt-4 mb-2 px-3', isSctiptTab && 'mt-3')}
              >
                {isSctiptTab ? (
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
                  <>
                    <Group>
                      <Text c="text-secondary" className="text-sm font-medium">
                        {convertedTable.columns.length} columns, {formatNumber(rowCount)} rows
                      </Text>
                    </Group>
                    <Group className="h-full px-4">
                      <ActionIcon size={16} onClick={() => handleCopyToClipboard(convertedTable)}>
                        <IconCopy />
                      </ActionIcon>
                    </Group>
                  </>
                )}
              </Group>
            )}

            <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
              <Table
                data={convertedTable.data}
                columns={convertedTable.columns}
                onSort={(colId: string) => {
                  // TODO: Pass sort function to set the sort state
                }}
                // TODO: get the sort state from the store
                sort={undefined}
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
            onPrevPage={() => {}}
            onNextPage={() => {}}
          />
        </div>
      )}
    </div>
  );
});

TabView.displayName = 'TabView';
