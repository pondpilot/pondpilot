/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { ColumnMeta } from '@components/table/model';
import { Box, Tooltip } from '@mantine/core';
import { Cell, flexRender } from '@tanstack/react-table';
import { copyToClipboard } from '@utils/clipboard';
import { isNumberType, stringifyTypedValue } from '@utils/db';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo, useLayoutEffect, useRef, useState } from 'react';

interface TableRegularCellProps {
  cell: Cell<any, unknown>;
  isLastCell: boolean;
  isLastRow: boolean;
  isCellSelected: boolean;
  isColumnSelected: boolean;
  layoutVersion: number;
  onSelect: (value: Cell<any, any>) => void;
}

export const TableRegularCell = memo(
  ({
    cell,
    isLastCell,
    isLastRow,
    isCellSelected,
    isColumnSelected,
    layoutVersion,
    onSelect,
  }: TableRegularCellProps) => {
    // We need ref to check if the cell is truncated
    const cellRef = useRef<HTMLDivElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

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

    useLayoutEffect(() => {
      const element = cellRef.current;
      if (!element) return;
      setIsTruncated(element.scrollWidth > element.clientWidth);
    }, [formattedValue, layoutVersion]);

    const cellElement = (
      <Box
        data-truncated={isTruncated || undefined}
        tabIndex={isTruncated ? 0 : undefined}
        data-testid={setDataTestId(`data-table-cell-container-${cell.column.id}-${cell.row.index}`)}
        className={cn(
          'whitespace-nowrap overflow-hidden border-transparent select-none',
          'border-r border-borderLight-light dark:border-borderLight-dark first:border-l ',
          isLastRow && isLastCell && 'rounded-br-lg',
          isHighlighted &&
            'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032 dark:border-borderAccent-dark border-transparent outline-solid outline-borderAccent-light dark:outline-borderAccent-dark -outline-offset-1',
          isColumnSelected && 'outline-offset-0',
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
            'text-sm overflow-hidden text-ellipsis whitespace-nowrap',
            isNumberType(columnValueSqlType)
              ? 'justify-end font-mono flex w-full py-2 pl-2 pr-7'
              : 'p-2',
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

    const defaultNode = (
      <Tooltip
        withinPortal
        disabled={!isTruncated}
        events={{ hover: true, focus: true, touch: false }}
        label={formattedValue}
      >
        {cellElement}
      </Tooltip>
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
            'bg-transparentBrandBlue-012 dark:bg-darkModeTransparentBrandBlue-032 dark:border-borderAccent-dark border-transparent outline-solid outline-borderAccent-light dark:outline-borderAccent-dark -outline-offset-1',
          isColumnSelected && 'outline-offset-0',
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
