import { Table as TableType, Cell } from '@tanstack/react-table';
import { memo } from 'react';

import { cn } from '@utils/ui/styles';

import { TableIndexCell, TableRegularCell } from './components';

export const TableBody = ({
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
          {row
            .getVisibleCells()
            .map((cell, index) =>
              index === 0 ? (
                <TableIndexCell
                  key={cell.id}
                  cell={cell}
                  isLastRow={lastRow}
                  isCellSelected={selectedCellId === cell.id}
                  isColumnSelected={selectedCols[cell.column.id]}
                  onSelect={onCellSelect}
                />
              ) : (
                <TableRegularCell
                  key={cell.id}
                  cell={cell}
                  isLastCell={index === row.getVisibleCells().length - 1}
                  isLastRow={lastRow}
                  isCellSelected={selectedCellId === cell.id}
                  isColumnSelected={selectedCols[cell.column.id]}
                  onSelect={onCellSelect}
                />
              ),
            )}
        </div>
      );
    })}
  </div>
);

export const MemoizedTableBody = memo(
  TableBody,
  (prev, next) => prev.table.options.data === next.table.options.data,
) as typeof TableBody;
