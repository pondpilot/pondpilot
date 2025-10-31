/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { ColumnMeta } from '@components/table/model';
import { Box, Tooltip } from '@mantine/core';
import { Cell, flexRender } from '@tanstack/react-table';
import { copyToClipboard } from '@utils/clipboard';
import { isNumberType, stringifyTypedValue } from '@utils/db';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo, useRef } from 'react';

interface TableRegularCellProps {
  cell: Cell<any, unknown>;
  isLastCell: boolean;
  isLastRow: boolean;
  isCellSelected: boolean;
  isColumnSelected: boolean;
  onSelect: (value: Cell<any, any>) => void;
}

export const TableRegularCell = memo(
  ({
    cell,
    isLastCell,
    isLastRow,
    isCellSelected,
    isColumnSelected,
    onSelect,
  }: TableRegularCellProps) => {
    // We need ref to check if the cell is truncated
    const cellRef = useRef<HTMLDivElement>(null);

    const handleCellClick = () => {
      onSelect(cell);
    };
    const colIndex = cell.column.getIndex();
    const columnMeta = cell.column.columnDef.meta as ColumnMeta | undefined;
    const columnValueSqlType = columnMeta?.type || 'other';
    const { type: fValueType, formattedValue } = stringifyTypedValue({
      type: columnValueSqlType,
      value: cell.getValue(),
    });
    const isHighlighted = isCellSelected || isColumnSelected;

    let isTruncated = false;
    if (cellRef.current) {
      isTruncated = cellRef.current.scrollWidth > cellRef.current.clientWidth;
    }

    const cellElement = (
      <Box
        // ref={boxRef}
        data-testid={setDataTestId(`data-table-cell-container-${cell.column.id}-${cell.row.index}`)}
        className={cn(
          'whitespace-nowrap overflow-hidden border-transparent select-none',
          'border-r border-borderLight-light dark:border-borderLight-dark first:border-l ',
          isLastRow && isLastCell && 'rounded-br-lg',
          isHighlighted &&
            'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032 dark:border-borderAccent-dark border-transparent outline outline-borderAccent-light dark:outline-borderAccent-dark outline-offset-[-1px]',
          isColumnSelected && 'outline-offset-[0px]',
        )}
        onClick={handleCellClick}
        style={{
          width: `calc(var(--col-${colIndex}-size) * 1px)`,
        }}
      >
        <div
          ref={cellRef}
          data-testid={setDataTestId(`data-table-cell-value-${cell.column.id}-${cell.row.index}`)}
          className={cn(
            'text-sm p-2 overflow-hidden text-ellipsis whitespace-nowrap',
            isNumberType(columnValueSqlType) && 'justify-end font-mono flex w-full',
            fValueType !== 'regular' &&
              'italic text-textSecondary-light dark:text-textSecondary-dark',
          )}
          onClick={(e) =>
            e.shiftKey &&
            copyToClipboard(formattedValue, {
              showNotification: true,
              notificationTitle: 'Selected cell copied to clipboard',
            })
          }
        >
          {formattedValue}
        </div>
      </Box>
    );

    const defaultNode = isTruncated ? (
      <Tooltip withinPortal label={formattedValue}>
        {cellElement}
      </Tooltip>
    ) : (
      cellElement
    );

    if (columnMeta?.cellRenderer) {
      return columnMeta.cellRenderer({
        cell,
        formattedValue,
        isCellSelected,
        isColumnSelected,
        defaultNode,
      });
    }

    return defaultNode;
  },
);
TableRegularCell.displayName = 'TableRegularCell';

interface TableIndexCellProps {
  cell: Cell<any, unknown>;
  isLastRow: boolean;
  isCellSelected: boolean;
  isColumnSelected: boolean;
  onSelect: (value: Cell<any, any>) => void;
}

export const TableIndexCell = memo(
  ({ cell, isLastRow, isCellSelected, isColumnSelected, onSelect }: TableIndexCellProps) => {
    const handleCellClick = () => {
      onSelect(cell);
    };

    const isHighlighted = isCellSelected || isColumnSelected;
    const colIndex = cell.column.getIndex();

    return (
      <Box
        data-testid={setDataTestId(`data-table-cell-container-${cell.column.id}-${cell.row.index}`)}
        className={cn(
          'whitespace-nowrap overflow-hidden border-transparent select-none',
          'border-r border-borderLight-light dark:border-borderLight-dark first:border-l ',
          isLastRow && 'rounded-bl-lg',
          isHighlighted &&
            'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032 dark:border-borderAccent-dark border-transparent outline outline-borderAccent-light dark:outline-borderAccent-dark outline-offset-[-1px]',
          isColumnSelected && 'outline-offset-[0px]',
        )}
        onClick={handleCellClick}
        style={{
          width: `calc(var(--col-${colIndex}-size) * 1px)`,
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </Box>
    );
  },
);
TableIndexCell.displayName = 'TableIndexCell';
