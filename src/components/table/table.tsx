import { ColumnMeta, GetRowClassName } from '@components/table/model';
import { Text } from '@mantine/core';
import { useDidUpdate, useHotkeys } from '@mantine/hooks';
import { DataTableSlice } from '@models/data-adapter';
import { ColumnSortSpecList, DBColumn, DBTableOrViewSchema, DataRow } from '@models/db';
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table';
import { copyToClipboard } from '@utils/clipboard';
import { setDataTestId } from '@utils/test-id';
import { memo, useEffect, useMemo, useRef } from 'react';

import { MemoizedTableBody, TableBody } from './components/table-body';
import { TableHeadCell } from './components/thead-cell';
import { useNoResultsPosition, useTableSelection } from './hooks';
import { getTableColumns } from './utils';

interface TableProps {
  dataSlice: DataTableSlice;
  schema: DBTableOrViewSchema;
  sort: ColumnSortSpecList;
  visible: boolean;
  initialColumnSizes?: Record<string, number>;
  columns?: ColumnDef<DataRow, any>[];
  // Undefined means sorting is blocked
  onSort?: (columnId: string) => void;
  // Undefined means copying is blocked
  onSelectedColsCopy?: (cols: DBTableOrViewSchema) => void;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: (column: DBColumn | null) => void;
  onColumnResizeChange?: (columnSizes: Record<string, number>) => void;
  getRowClassName?: GetRowClassName<DataRow>;
}

export const Table = memo(
  ({
    dataSlice,
    schema,
    sort,
    visible,
    initialColumnSizes,
    columns,
    onSort,
    onSelectedColsCopy,
    onColumnSelectChange,
    onCellSelectChange,
    onRowSelectChange,
    onColumnResizeChange,
    getRowClassName,
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
      if (columns) {
        return columns;
      }
      return getTableColumns({
        schema,
        initialColumnSizes: columnSizesRef.current,
        onRowSelectionChange,
      });
      // Note that `columnSizesRef.current` is not a dependency here intentionally!
      // See the reasoning above.
    }, [columns, schema, onRowSelectionChange]);

    const table = useReactTable({
      data: dataSlice.data,
      meta: { rowOffset: dataSlice.rowOffset },
      columns: tableColumns,
      columnResizeMode: 'onEnd',
      getCoreRowModel: getCoreRowModel(),
      state: { rowSelection: selectedRows },
    });

    const { columnSizingInfo, columnSizing } = table.getState();

    const { columnSizeVars, colSizes } = useMemo(() => {
      const headers = table.getFlatHeaders();
      const sizes: { [key: string]: number } = {};
      const sizeVars: { [key: string]: number } = {};

      for (let i = 0; i < headers.length; i += 1) {
        const header = headers[i]!;

        sizeVars[`--header-${header.index}-size`] = header.getSize();
        sizeVars[`--col-${header.index}-size`] = header.column.getSize();
        sizes[header.index] = header.getSize();
      }

      const sizingKeys = Object.keys(columnSizing);
      for (let i = 0; i < sizingKeys.length; i += 1) {
        const key = sizingKeys[i]!;
        if (!(key in sizeVars)) {
          const existingSize = columnSizing[key];
          if (typeof existingSize === 'number') {
            sizeVars[`--col-${key}-size`] = existingSize;
          }
        }
      }

      // Access resizing state so memo updates when the active resize target changes
      if (columnSizingInfo.isResizingColumn !== null) {
        // no-op
      }

      columnSizesRef.current = sizes;
      return { columnSizeVars: sizeVars, colSizes: sizes };
    }, [columnSizing, columnSizingInfo, table]);

    // Notify parent of column size changes after render (not during)
    useEffect(() => {
      onColumnResizeChange?.(colSizes);
    }, [colSizes, onColumnResizeChange]);

    useDidUpdate(() => {
      clearSelection();
    }, [JSON.stringify(schema)]);

    useHotkeys([
      [
        'mod+C',
        (event) => {
          if (!visible) return;

          // Don't intercept copy if the event target or active element is in
          // a text-editable context (like Monaco editor or input fields).
          // This allows users to copy text from the query editor even when
          // a table cell is selected.
          const target = event.target as HTMLElement | null;
          const activeElement = document.activeElement as HTMLElement | null;

          // Check event target
          if (target) {
            const isTargetInMonaco = target.closest('.monaco-editor') !== null;
            const isTargetEditable =
              target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.isContentEditable;
            if (isTargetInMonaco || isTargetEditable) return;
          }

          // Also check active element (for cases where event target differs)
          if (activeElement) {
            const isActiveInMonaco = activeElement.closest('.monaco-editor') !== null;
            const isActiveEditable =
              activeElement.tagName === 'INPUT' ||
              activeElement.tagName === 'TEXTAREA' ||
              activeElement.isContentEditable;
            if (isActiveInMonaco || isActiveEditable) return;
          }

          // Only prevent default if we're actually handling the copy
          event.preventDefault();

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
            const selectedSchemaColumns = schema.filter((col) => selectedCols[col.id]);
            onSelectedColsCopy(selectedSchemaColumns);
          }
        },
        { preventDefault: false },
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
                  const columnMeta = header.column.columnDef.meta as ColumnMeta | undefined;
                  const columnName = columnMeta?.name ?? header.column.id;
                  const sortKey = columnMeta?.sortColumnName ?? columnName;
                  const appliedSort = sort.find((s) => s.column === sortKey) ?? null;

                  return (
                    <TableHeadCell
                      key={header.id}
                      header={header}
                      index={index}
                      totalHeaders={headerGroup.headers.length}
                      sort={appliedSort}
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
            getRowClassName={getRowClassName}
          />
        ) : (
          <TableBody
            table={table}
            selectedCellId={selectedCell.cellId}
            selectedCols={selectedCols}
            onCellSelect={handleCellSelect}
            getRowClassName={getRowClassName}
          />
        )}
      </div>
    );
  },
);

Table.displayName = 'Table';
