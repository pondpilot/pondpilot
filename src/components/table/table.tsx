import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useDidUpdate, useHotkeys } from '@mantine/hooks';
import { replaceSpecialChars } from '@utils/helpers';
import { setDataTestId } from '@utils/test-id';

import { ColumnSortSpecList, DBColumn, DBTableOrViewSchema } from '@models/db';
import { Text } from '@mantine/core';
import { copyToClipboard } from '@utils/clipboard';
import { getTableColumns, useTableSelection } from './hooks';
import { MemoizedTableBody, TableBody } from './components/table-body';
import { TableHeadCell } from './components/thead-cell';

interface TableProps {
  data: Record<string, any>[];
  schema: DBTableOrViewSchema;
  sort: ColumnSortSpecList;
  page: number;
  visible: boolean;
  initialCoulmnSizes?: Record<string, number>;
  // Undefined means sorting is blocked
  onSort?: (columnId: string) => void;
  // Undefined means copying is blocked
  onSelectedColsCopy?: (cols: DBTableOrViewSchema) => void;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: (column: DBColumn | null) => void;
  onColumnResizeChange?: (columnSizes: Record<string, number>) => void;
}

const fallbackData = [] as any[];

export const Table = ({
  data,
  schema,
  sort,
  page,
  visible,
  initialCoulmnSizes,
  onSort,
  onSelectedColsCopy,
  onColumnSelectChange,
  onCellSelectChange,
  onRowSelectChange,
  onColumnResizeChange,
}: TableProps) => {
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

  const tableColumns = useMemo(() => {
    return getTableColumns({ schema, onRowSelectionChange, page });
  }, [schema, page, initialCoulmnSizes, onRowSelectionChange]);

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
    const colSizeVars: { [key: string]: number } = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i]!;

      const headerName = replaceSpecialChars(header.id);
      const colName = replaceSpecialChars(header.column.id);

      colSizeVars[`--header-${headerName}-size`] = header.getSize();
      colSizeVars[`--col-${colName}-size`] = header.column.getSize();
      colSizes[header.column.id] = header.getSize();
    }

    onColumnResizeChange?.(colSizes);
    return colSizeVars;
  }, [
    schema,
    onColumnResizeChange,
    table.getState().columnSizingInfo,
    table.getState().columnSizing,
  ]);

  useDidUpdate(() => {
    clearSelection();
  }, [JSON.stringify(schema)]);

  useHotkeys([
    [
      'mod+C',
      () => {
        if (!visible) return;
        if (selectedCell.value) {
          copyToClipboard(selectedCell.value, {
            showNotification: true,
            notificationTitle: 'Selected cell copied to clipboard',
          });
        }
        if (Object.keys(selectedRows).length) {
          handleCopySelectedRows(table);
        }
        if (Object.keys(selectedCols).length && onSelectedColsCopy) {
          const columns = schema.filter((col) => selectedCols[col.name]);
          onSelectedColsCopy(columns);
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
                    sort={sort.find((s) => s.column === header.id)}
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
