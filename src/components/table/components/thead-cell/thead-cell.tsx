/* eslint-disable jsx-a11y/no-static-element-interactions */
import { IconType, NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { ColumnMeta } from '@components/table/model';
import { Text } from '@mantine/core';
import { ColumnSortSpec, DataRow } from '@models/db';
import { IconTriangleInvertedFilled } from '@tabler/icons-react';
import { Header, Table as TableType } from '@tanstack/react-table';
import { isNumberType } from '@utils/db';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo } from 'react';

interface TableHeadCellProps {
  header: Header<DataRow, unknown>;
  table: TableType<DataRow>;
  index: number;
  totalHeaders: number;
  isSelected: boolean;
  sort?: ColumnSortSpec | null;
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
  iconType: IconType;
  sortKey: string;
}

const THeadTitle = ({
  header,
  isIndex,
  isNumber,
  isSelected,
  iconType,
  sort,
  onSort,
  sortKey,
}: THeadTitleProps) => {
  const { name: columnName } = header.column.columnDef.meta as ColumnMeta;

  return (
    <>
      {!isIndex && (
        <div
          className={cn(
            'text-iconDefault-light dark:text-iconDefault-dark',
            isSelected && 'text-iconDisabled',
            isNumber && 'ml-auto',
          )}
        >
          <NamedIcon iconType={iconType} size={16} />
        </div>
      )}
      <Text truncate="end" fw={500}>
        {header.isPlaceholder ? null : columnName}
      </Text>
      {!isIndex && (
        <div
          className={cn(
            'p-2 -m-2', // Add padding and negative margin to increase click area without changing layout
            !isNumber && 'ml-auto',
          )}
          data-testid={setDataTestId(`data-table-header-cell-sort-${columnName}`)}
          onMouseDown={(e) => {
            e.stopPropagation();
            onSort?.(sortKey);
          }}
        >
          <IconTriangleInvertedFilled
            size={8}
            className={cn(
              'opacity-0 text-iconDefault-light dark:text-iconDefault-dark',
              sort?.column === sortKey && 'opacity-100',
              'group-hover:opacity-100',
              sort?.order === 'asc' && sort?.column === sortKey && 'rotate-180',
              (isSelected || !onSort) && 'text-iconDisabled',
            )}
          />
        </div>
      )}
    </>
  );
};

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
    const isIndexColumn = header.column.getIsFirstColumn();
    // This will be missing for index column
    const columnMeta = header.column.columnDef.meta as ColumnMeta | undefined;
    const type = columnMeta?.type || 'other';
    const columnName = columnMeta?.name ?? header.column.id;
    const sortKey = columnMeta?.sortColumnName ?? columnName;
    const iconType = getIconTypeForSQLType(type);
    const isNumber = isNumberType(type);
    const headStyles = {
      width: `calc(var(--header-${header.index}-size) * 1px)`,
      overflow: 'visible',
    };

    const handleMouseEvent = (e: React.MouseEvent) => {
      isIndexColumn ? null : onHeadCellClick(header.column.id, e);
    };

    const defaultContent = (
      <THeadTitle
        header={header}
        isIndex={isIndexColumn}
        isNumber={isNumber}
        isSelected={isSelected}
        iconType={iconType}
        sort={sort}
        onSort={onSort}
        sortKey={sortKey}
      />
    );

    const renderedContent = columnMeta?.headerRenderer
      ? columnMeta.headerRenderer({
          header,
          isSelected,
          sort: sort ?? null,
          onSort,
          iconType,
          isIndex: isIndexColumn,
          isNumber,
          defaultNode: defaultContent,
        })
      : defaultContent;

    return (
      <div
        data-testid={setDataTestId(`data-table-header-cell-container-${header.column.id}`)}
        className={cn(
          'relative z-10 flex items-center justify-between gap-1 px-4 py-[11px] h-[40px] text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark whitespace-nowrap select-none border-transparent',
          'border-borderLight-light dark:border-borderLight-dark border-r',
          index === 0 && 'rounded-tl-xl border-l-0',
          index === totalHeaders - 1 && 'rounded-tr-xl border-r-0',
          'overflow-hidden cursor-pointer',
          (isNumber || isIndexColumn) && 'justify-end',
          isSelected &&
            'bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-textContrast-light dark:text-textContrast-dark border-borderAccent-light dark:border-borderAccent-dark',
          'group',
          isIndexColumn && 'pr-2',
        )}
        key={header.id}
        style={headStyles}
        onMouseDown={handleMouseEvent}
      >
        {renderedContent}
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
    prevProps.sort?.column === nextProps.sort?.column &&
    prevProps.sort?.order === nextProps.sort?.order &&
    prevProps.resizingColumnId === nextProps.resizingColumnId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.deltaOffset === nextProps.deltaOffset &&
    prevProps.onHeadCellClick === nextProps.onHeadCellClick &&
    prevProps.onSort === nextProps.onSort,
);

TableHeadCell.displayName = 'TableHeadCell';
