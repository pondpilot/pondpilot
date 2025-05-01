import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { memo, useMemo, useRef } from 'react';
import { useDidUpdate, useHotkeys } from '@mantine/hooks';
import { setDataTestId } from '@utils/test-id';

import { ColumnSortSpecList, DBColumn, DBTableOrViewSchema } from '@models/db';
import { Text } from '@mantine/core';
import { copyToClipboard } from '@utils/clipboard';
import { DataTableSlice } from '@models/data-adapter';
import { ColumnMeta } from '@components/table/model';
import { useNoResultsPosition, useTableSelection } from './hooks';
import { MemoizedTableBody, TableBody } from './components/table-body';
import { TableHeadCell } from './components/thead-cell';
import { getTableColumns } from './utils';

interface TableProps {
  dataSlice: DataTableSlice;
  schema: DBTableOrViewSchema;
  sort: ColumnSortSpecList;
  visible: boolean;
  initialColumnSizes?: Record<string, number>;
  // Undefined means sorting is blocked
  onSort?: (columnId: string) => void;
  // Undefined means copying is blocked
  onSelectedColsCopy?: (cols: DBTableOrViewSchema) => void;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: (column: DBColumn | null) => void;
  onColumnResizeChange?: (columnSizes: Record<string, number>) => void;
}

export const Table = memo(
  ({
    dataSlice,
    schema,
    sort,
    visible,
    initialColumnSizes,
    onSort,
    onSelectedColsCopy,
    onColumnSelectChange,
    onCellSelectChange,
    onRowSelectChange,
    onColumnResizeChange,
  }: TableProps) => {
    const hasRows = dataSlice.data.length > 0;

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

    const { containerRef, position } = useNoResultsPosition({
      hasRows,
      schema,
    });

    // We want non-reactive column sizes, that we initialize from the prop
    // and update as the table resizes (without tiggering re-renders).
    // This allows us to set the default column sizes in `getTableColumns`
    // whenever the schema is changed and otherwise keep column defs memoized.
    const columnSizesRef = useRef<Record<string, number>>(initialColumnSizes);

    const tableColumns = useMemo(() => {
      return getTableColumns({
        schema,
        initialColumnSizes: columnSizesRef.current,
        onRowSelectionChange,
      });
      // Note that `columnSizesRef.current` is not a dependency here intentionally!
      // See the reasoning above.
    }, [schema, onRowSelectionChange]);

    const table = useReactTable({
      data: dataSlice.data,
      meta: { rowOffset: dataSlice.rowOffset },
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

        colSizeVars[`--header-${header.index}-size`] = header.getSize();
        colSizeVars[`--col-${header.index}-size`] = header.column.getSize();
        colSizes[header.index] = header.getSize();
      }

      onColumnResizeChange?.(colSizes);
      columnSizesRef.current = colSizes;
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
          if (selectedCell.formattedValue) {
            copyToClipboard(selectedCell.formattedValue.formattedValue, {
              showNotification: true,
              notificationTitle: 'Selected cell copied to clipboard',
            });
          }
          if (Object.keys(selectedRows).length) {
            handleCopySelectedRows(table);
          }
          if (Object.keys(selectedCols).length && onSelectedColsCopy) {
            const columns = schema.filter((col) => selectedCols[col.id]);
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
        className="w-fit rounded-xl"
        data-testid={setDataTestId('data-table')}
        ref={containerRef}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
          <div className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-t-xl border-borderLight-light dark:border-borderLight-dark">
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} className="flex">
                {headerGroup.headers.map((header, index) => {
                  const { deltaOffset } = table.getState().columnSizingInfo;
                  const resizingColumnId = table.getState().columnSizingInfo.isResizingColumn;
                  const { name: columnName } = header.column.columnDef.meta as ColumnMeta;

                  return (
                    <TableHeadCell
                      key={header.id}
                      header={header}
                      index={index}
                      totalHeaders={headerGroup.headers.length}
                      sort={sort.find((s) => s.column === columnName)}
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
        {!hasRows && (
          <div className="w-full h-10 flex justify-start items-center text-textSecondary-light dark:text-textSecondary-dark border-b border-x border-borderLight-light dark:border-borderLight-dark rounded-b-xl relative">
            <div
              style={{
                position: 'absolute',
                left: position.left,
                transform: 'translateX(-50%)',
              }}
            >
              <Text c="text-secondary">No results</Text>
            </div>
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
  },
);

Table.displayName = 'Table';
