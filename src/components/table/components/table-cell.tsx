/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { Cell, flexRender } from '@tanstack/react-table';
import { cn } from '@utils/ui/styles';
import { memo } from 'react';
import { replaceSpecialChars } from 'utils';

interface TableCellProps {
  cell: Cell<any, unknown>;
  isFirstCell: boolean;
  isLastCell: boolean;
  isLastRow: boolean;
  isCellSelected: boolean;
  isColumnSelected: boolean;
  onSelect: (value: Cell<any, any>) => void;
}

export const TableCell = memo(
  ({
    cell,
    isFirstCell,
    isLastCell,
    isLastRow,
    isCellSelected,
    isColumnSelected,
    onSelect,
  }: TableCellProps) => {
    const handleCellClick = () => {
      onSelect(cell);
    };

    const isHighlighted = isCellSelected || isColumnSelected;

    return (
      <div
        className={cn(
          'whitespace-nowrap overflow-hidden border-transparent select-none',
          'border-r border-borderLight-light dark:border-borderLight-dark first:border-l ',
          isLastRow && isFirstCell && 'rounded-bl-lg',
          isLastRow && isLastCell && 'rounded-br-lg',
          isHighlighted &&
            'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032 dark:border-borderAccent-dark border-transparent outline outline-borderAccent-light dark:outline-borderAccent-dark outline-offset-[-1px]',
          isColumnSelected && 'outline-offset-[0px]',
        )}
        onClick={handleCellClick}
        style={{
          width: `calc(var(--col-${replaceSpecialChars(cell.column.id)}-size) * 1px)`,
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </div>
    );
  },
);
TableCell.displayName = 'TableCell';
