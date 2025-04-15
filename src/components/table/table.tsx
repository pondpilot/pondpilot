import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useClipboard, useDidUpdate, useHotkeys } from '@mantine/hooks';
import { replaceSpecialChars } from '@utils/helpers';
import { useAppNotifications } from '@components/app-notifications';
import { CalculateColumnSummaryProps } from '@features/tab-view/hooks';
import { setDataTestId } from '@utils/test-id';

import { ColumnSortSpec, DBTableOrViewSchema } from '@models/db';
import { Text } from '@mantine/core';
import { useTableColumns, useTableSelection } from './hooks';
import { MemoizedTableBody, TableBody } from './components/table-body';
import { TableHeadCell } from './components/thead-cell';

interface TableProps {
  data: Record<string, any>[];
  schema: DBTableOrViewSchema;
  sort?: ColumnSortSpec | null;
  page: number;
  visible: boolean;
  onSort?: (columnId: string) => void;
  onSelectedColsCopy: (cols: Record<string, boolean>) => void;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: ({ columnName, dataType }: CalculateColumnSummaryProps) => void;
}

const fallbackData = [] as any[];

export const Table = ({
  data,
  schema,
  onSort,
  sort,
  onSelectedColsCopy,
  onColumnSelectChange,
  onCellSelectChange,
  onRowSelectChange,
  page,
  visible,
}: TableProps) => {
  const { showSuccess } = useAppNotifications();
  const clipboard = useClipboard();

  const hasData = data.length > 0;

  const {
    handleCellSelect,
    clearSelection,
    selectedCell,
    selectedCols,
    selectedRows,
    onRowSelectionChange,
    handleCopySelectedRows,
    handleHeadCellClick,
  } = useTableSelection({
    onColumnSelectChange,
    schema,
    onRowSelectChange,
    onCellSelectChange,
  });

  const tableColumns = useTableColumns({ columns: schema, onRowSelectionChange, page });

  const table = useReactTable({
    data: data || fallbackData,
    columns: tableColumns,
    columnResizeMode: 'onEnd',
    getCoreRowModel: getCoreRowModel(),
    state: { rowSelection: selectedRows },
  });

  const columnSizeVars = useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: number } = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i]!;

      const headerName = replaceSpecialChars(header.id);
      const colName = replaceSpecialChars(header.column.id);

      colSizes[`--header-${headerName}-size`] = header.getSize();
      colSizes[`--col-${colName}-size`] = header.column.getSize();
    }
    return colSizes;
  }, [table.getState().columnSizingInfo, table.getState().columnSizing, data]);

  useDidUpdate(() => {
    clearSelection();
  }, [JSON.stringify(schema)]);

  useHotkeys([
    [
      'mod+C',
      () => {
        if (!visible) return;
        if (selectedCell.value) {
          clipboard.copy(selectedCell.value);
          showSuccess({
            title: 'Selected cell copied to clipboard',
            message: '',
            autoClose: 800,
          });
        }
        if (Object.keys(selectedRows).length) {
          handleCopySelectedRows(table);
        }
        if (Object.keys(selectedCols).length) {
          onSelectedColsCopy(selectedCols);
        }
      },
    ],
    ['Escape', clearSelection],
  ]);

  return (
    <div
      style={{
        ...columnSizeVars,
        width: table.getTotalSize(),
      }}
      className="relative w-fit rounded-xl"
      data-testid={setDataTestId('data-table')}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
        <div className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-t-xl border-borderLight-light dark:border-borderLight-dark">
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="flex">
              {headerGroup.headers.map((header, index) => {
                const { deltaOffset } = table.getState().columnSizingInfo;
                const resizingColumnId = table.getState().columnSizingInfo.isResizingColumn;

                return (
                  <TableHeadCell
                    key={header.id}
                    header={header}
                    index={index}
                    totalHeaders={headerGroup.headers.length}
                    sort={sort}
                    table={table}
                    onSort={onSort}
                    resizingColumnId={resizingColumnId}
                    deltaOffset={header.id === resizingColumnId ? deltaOffset : null}
                    onHeadCellClick={handleHeadCellClick}
                    isSelected={selectedCols[header.id]}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Body */}
      {!hasData && (
        <div className="py-3 px-4 flex justify-center items-center text-textSecondary-light dark:text-textSecondary-dark border-b border-x border-borderLight-light dark:border-borderLight-dark rounded-b-xl">
          <Text c="text-tertiary">No results</Text>
        </div>
      )}
      {table.getState().columnSizingInfo.isResizingColumn ? (
        <MemoizedTableBody
          table={table}
          selectedCellId={selectedCell.cellId}
          selectedCols={selectedCols}
          onCellSelect={handleCellSelect}
        />
      ) : (
        <TableBody
          table={table}
          selectedCellId={selectedCell.cellId}
          selectedCols={selectedCols}
          onCellSelect={handleCellSelect}
        />
      )}
    </div>
  );
};
