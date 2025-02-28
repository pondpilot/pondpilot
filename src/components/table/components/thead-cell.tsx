/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { IconTriangleInvertedFilled } from '@tabler/icons-react';
import { Text } from '@mantine/core';
import { Header, Table as TableType } from '@tanstack/react-table';
import { cn } from '@utils/ui/styles';
import { replaceSpecialChars } from 'utils';
import { memo } from 'react';
import { SortModel } from 'store/pagination-store';
import { getIcon } from '../utils';

interface TableHeadCellProps {
  header: Header<Record<string, string | number>, unknown>;
  table: TableType<Record<string, string | number>>;
  index: number;
  totalHeaders: number;
  isSelected: boolean;
  sort: SortModel;
  resizingColumnId?: string | false;
  deltaOffset: number | null;

  onSort?: (columnId: string) => void;
  onHeadCellClick: (columnId: string, e: React.MouseEvent<Element, MouseEvent>) => void;
}

interface THeadTitleProps
  extends Omit<
    TableHeadCellProps,
    'table' | 'index' | 'totalHeaders' | 'deltaOffset' | 'onHeadCellClick'
  > {
  isIndex: boolean;
  isNumber: boolean;
  icon: any;
}

const THeadTitle = memo(
  ({ header, isIndex, isNumber, isSelected, icon, sort, onSort }: THeadTitleProps) => (
    <>
      {!isIndex && (
        <div
          className={cn(
            'text-iconDefault-light dark:text-iconDefault-dark',
            isSelected && 'text-iconDisabled',
            isNumber && 'ml-auto',
          )}
        >
          {icon}
        </div>
      )}
      <Text truncate="end" fw={500}>
        {header.isPlaceholder ? null : header.column.id}
      </Text>
      {!isIndex && (
        <div>
          <IconTriangleInvertedFilled
            size={8}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSort?.(header.column.id);
            }}
            className={cn(
              'opacity-0 text-iconDefault-light dark:text-iconDefault-dark',
              sort.field === header.column.id && 'opacity-100',
              'group-hover:opacity-100',
              sort.direction === 'asc' && sort.field === header.column.id && 'rotate-180',
              !isNumber && 'ml-auto',
              isSelected && 'text-iconDisabled',
            )}
          />
        </div>
      )}
    </>
  ),
  (prevProps, nextProps) =>
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.sort.field === nextProps.sort.field &&
    prevProps.sort.direction === nextProps.sort.direction,
);

export const TableHeadCell = memo(
  ({
    header,
    index,
    totalHeaders,
    sort,
    onSort,
    table,
    deltaOffset,
    resizingColumnId,
    onHeadCellClick,
    isSelected,
  }: TableHeadCellProps) => {
    const colMeta: any = header.column.columnDef.meta;
    const type = colMeta?.type;
    const isIndex = header.column.id === '#';
    const icon = getIcon(type);
    const isNumber = ['integer', 'number', 'date'].includes(type);
    const headStyles = {
      width: `calc(var(--header-${replaceSpecialChars(header.id)}-size) * 1px)`,
      overflow: 'visible',
    };

    const handleMouseEvent = (e: React.MouseEvent) => {
      isIndex ? null : onHeadCellClick(header.column.id, e);
    };

    return (
      <div
        className={cn(
          'relative z-10 flex items-center justify-between gap-1 px-4 py-[11px] h-[40px] text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark whitespace-nowrap select-none border-transparent',
          'border-borderLight-light dark:border-borderLight-dark border-r',
          index === 0 && 'rounded-tl-xl border-l-0',
          index === totalHeaders - 1 && 'rounded-tr-xl border-r-0',
          'overflow-hidden cursor-pointer',
          (isNumber || isIndex) && 'justify-end',
          isSelected &&
            'bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-textContrast-light dark:text-textContrast-dark border-borderAccent-light dark:border-borderAccent-dark',
          'group',
          isIndex && 'pr-2',
        )}
        key={header.id}
        style={headStyles}
        onMouseDown={handleMouseEvent}
      >
        <THeadTitle
          header={header}
          isIndex={isIndex}
          isNumber={isNumber}
          isSelected={isSelected}
          icon={icon}
          sort={sort}
          onSort={onSort}
        />
        <div
          {...{
            onDoubleClick: () => header.column.resetSize(),
            onMouseDown: (e) => {
              e.stopPropagation();
              return header.getResizeHandler()(e);
            },
            onTouchStart: header.getResizeHandler(),
            className: cn(
              'resizer bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
              resizingColumnId === header.id && 'isResizing',
            ),
            style: {
              transform:
                resizingColumnId === header.id
                  ? `translateX(${
                      (table.options.columnResizeDirection === 'rtl' ? -1 : 1) * (deltaOffset ?? 0)
                    }px)`
                  : '',
            },
          }}
        />
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.sort.field === nextProps.sort.field &&
    prevProps.sort.direction === nextProps.sort.direction &&
    prevProps.resizingColumnId === nextProps.resizingColumnId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.deltaOffset === nextProps.deltaOffset &&
    prevProps.onHeadCellClick === nextProps.onHeadCellClick &&
    prevProps.onSort === nextProps.onSort,
);

TableHeadCell.displayName = 'TableHeadCell';
