import { useReactTable, getCoreRowModel, Table as TableType, Cell } from '@tanstack/react-table';
import { cn } from '@utils/ui/styles';
import { memo, useMemo } from 'react';
import { SortModel } from '@store/pagination-store';
import { useClipboard, useDidUpdate, useHotkeys } from '@mantine/hooks';
import { replaceSpecialChars } from '@utils/helpers';
import { useAppNotifications } from '@components/app-notifications';
import { CalculateColumnSummaryProps } from '@features/data-viewer/hooks';
import { ResultColumn } from '@utils/arrow/helpers';
import { TableCell, TableHeadCell } from './components';
import { useTableColumns, useTableSelection } from './hooks';

interface TableProps {
  data: Record<string, any>[];
  columns: ResultColumn[];
  onSort?: (columnId: string) => void;
  onSelectedColsCopy: (cols: Record<string, boolean>) => void;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: ({ columnName, dataType }: CalculateColumnSummaryProps) => void;
  sort: SortModel;
}

const fallbackData = [] as any[];

const TableBody = ({
  table,
  selectedCellId,
  onCellSelect,
  selectedCols,
}: {
  table: TableType<any>;
  selectedCellId: string | null;
  onCellSelect: (cell: Cell<any, any>) => void;
  selectedCols: Record<string, boolean>;
}) => (
  <div>
    {table.getRowModel().rows.map((row, rowIndex) => {
      const oddRow = rowIndex % 2 !== 0;
      const isSelected = row.getIsSelected();

      const lastRow = rowIndex === table.getRowModel().rows.length - 1;
      return (
        <div
          key={row.id}
          className={cn(
            'flex border-borderLight-light dark:border-borderLight-dark  border-b',
            oddRow && 'bg-transparent004-light dark:bg-transparent004-dark',
            lastRow && 'rounded-bl-xl rounded-br-xl border-b',
            isSelected &&
              'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032   outline outline-borderAccent-light outline-offset-[-1px]',
          )}
        >
          {row.getVisibleCells().map((cell, index) => (
            <TableCell
              key={cell.id}
              cell={cell}
              isFirstCell={index === 0}
              isLastCell={index === row.getVisibleCells().length - 1}
              isLastRow={lastRow}
              isCellSelected={selectedCellId === cell.id}
              isColumnSelected={selectedCols[cell.column.id]}
              onSelect={onCellSelect}
            />
          ))}
        </div>
      );
    })}
  </div>
);

const MemoizedTableBody = memo(
  TableBody,
  (prev, next) => prev.table.options.data === next.table.options.data,
) as typeof TableBody;

export const Table = memo(
  ({
    data,
    columns,
    onSort,
    sort,
    onSelectedColsCopy,
    onColumnSelectChange,
    onCellSelectChange,
    onRowSelectChange,
  }: TableProps) => {
    const { showSuccess } = useAppNotifications();
    const clipboard = useClipboard();

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
      columns,
      onRowSelectChange,
      onCellSelectChange,
    });

    const tableColumns = useTableColumns({ columns, onRowSelectionChange });

    const table = useReactTable({
      data: data || fallbackData,
      columns: tableColumns,
      columnResizeMode: 'onEnd',
      getCoreRowModel: getCoreRowModel(),
      state: {
        rowSelection: selectedRows,
      },
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
    }, [data]);

    useHotkeys([
      [
        'mod+C',
        () => {
          if (selectedCell.value) {
            clipboard.copy(selectedCell.value);
            showSuccess({
              title: 'Copied to clipboard',
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
        data-testid="result-table"
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
