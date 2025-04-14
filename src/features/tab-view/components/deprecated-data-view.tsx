import { memo, useMemo } from 'react';
import { Table } from '@components/table/table';
import { Group, Text, ActionIcon, Center, Stack, Tooltip } from '@mantine/core';
import { IconClipboardSmile, IconCopy } from '@tabler/icons-react';
import { useAppContext } from '@features/app-context';
import { cn } from '@utils/ui/styles';
import { useClipboard } from '@mantine/hooks';
import { Table as ApacheTable } from 'apache-arrow';
import { getArrowTableSchema } from '@utils/arrow/schema';
import { useAppNotifications } from '@components/app-notifications';
import { setDataTestId } from '@utils/test-id';
import { formatNumber } from '@utils/helpers';
import { useTableExport } from '../hooks/useTableExport';
import { RowCountAndPaginationControl, TableLoadingOverlay } from '.';
import { useColumnSummary } from '../hooks';

const PAGE_SIZE = 100;

interface DataViewProps {
  data: ApacheTable<any> | null;
  isLoading: boolean;
  active: boolean;
  isScriptTab?: boolean;
}

export const DataView = memo(({ data, isLoading, isScriptTab = false, active }: DataViewProps) => {
  const { onCancelQuery } = useAppContext();
  const { handleCopyToClipboard } = useTableExport();
  const { showSuccess } = useAppNotifications();
  const clipboard = useClipboard();
  const { calculateColumnSummary, columnTotal, isCalculating, isNumericType, resetTotal } =
    useColumnSummary(undefined);

  // TODO: this should not happen this way. schema should be part of the data adapter
  // and be fetched separately. conversion of table to JSON and storing in cache should
  // be part of handlers
  const convertedTable = useMemo(() => {
    if (!data) {
      return { columns: [], data: [] };
    }

    const tableData = data.toArray().map((row) => row.toJSON());
    const columns = getArrowTableSchema(data) || [];

    return { columns, data: tableData };
  }, [data]);
  // Constants for UI rendering conditions
  const hasTableData = !!convertedTable.columns.length;
  const rowCount = convertedTable.data.length || 0;
  const isSinglePage = rowCount <= PAGE_SIZE;
  const currentPage = 1; // Would be managed by pagination logic in a full implementation

  // Event handlers
  const onCancel = () => onCancelQuery();

  const onSelectedColsCopy = async (cols: Record<string, boolean>) => {
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

      // In a real implementation, we would execute a query to get just the selected columns
      // For now, we'll just filter the data we already have
      const selectedData = convertedTable.data.map((row) => {
        const newRow: Record<string, any> = {};
        Object.keys(cols).forEach((col) => {
          if (cols[col]) {
            newRow[col] = row[col];
          }
        });
        return newRow;
      });

      const headers = Object.keys(cols)
        .filter((col) => cols[col])
        .join('\t');
      const rows = selectedData.map((row) =>
        Object.keys(row)
          .map((col) => row[col] ?? '')
          .join('\t'),
      );
      const tableText = [headers, ...rows].join('\n');

      clipboard.copy(tableText);

      // Update notification
      showSuccess({
        id: notificationId,
        title: 'Selected columns copied to clipboard',
        message: '',
        loading: false,
        autoClose: 800,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showSuccess({
        id: notificationId,
        title: 'Failed to copy selected columns',
        message,
        loading: false,
        autoClose: 5000,
        color: 'red',
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TableLoadingOverlay queryView={isScriptTab} onCancel={onCancel} visible={isLoading} />

      {!hasTableData && !isLoading && active && (
        <Center className="h-full font-bold">
          <Stack align="center" c="icon-default" gap={4}>
            <IconClipboardSmile size={32} stroke={1} />
            <Text c="text-secondary">Your query results will be displayed here.</Text>
          </Stack>
        </Center>
      )}

      {hasTableData && (
        <>
          {/* Header toolbar */}
          {hasTableData && (
            <Group
              justify="space-between"
              className={cn('h-7 mt-4 mb-2 px-3', isScriptTab && 'mt-3')}
            >
              {isScriptTab ? (
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
                    {/* // TODO: Fix export functionality */}
                    {/* <Menu position="bottom">
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
                      </Menu> */}
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

          {/* Table */}
          <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
            <Table
              data={convertedTable.data}
              columns={convertedTable.columns}
              onSort={(colId: string) => {
                // Sort handler would go here
                // In a full implementation, this would update sort state
              }}
              sort={undefined}
              page={currentPage}
              onSelectedColsCopy={onSelectedColsCopy}
              onColumnSelectChange={calculateColumnSummary}
              onRowSelectChange={resetTotal}
              onCellSelectChange={resetTotal}
              visible={!!active}
            />
          </div>

          {/* Footer with summary information */}
          {columnTotal !== null && (
            <Group
              align="center"
              className="border-t px-2 py-1 border-borderPrimary-light dark:border-borderPrimary-dark"
            >
              <Text c="text-primary" className="text-sm">
                {isNumericType ? 'SUM' : 'COUNT'}: {columnTotal}
              </Text>
            </Group>
          )}
        </>
      )}

      {/* Pagination control */}
      {hasTableData && !isSinglePage && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <RowCountAndPaginationControl
            currentPage={currentPage}
            maxItemsPerPage={PAGE_SIZE}
            rowCount={rowCount}
            onPrevPage={() => {
              // In a full implementation, this would update the page
            }}
            onNextPage={() => {
              // In a full implementation, this would update the page
            }}
          />
        </div>
      )}
    </div>
  );
});
