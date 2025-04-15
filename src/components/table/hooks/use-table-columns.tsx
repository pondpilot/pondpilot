/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { Cell, CellContext, Column, ColumnDef, Row, Table } from '@tanstack/react-table';
import React, { useCallback, useMemo } from 'react';
import { Tooltip } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import { setDataTestId } from '@utils/test-id';
import { DBColumn } from '@models/db';
import { stringifyTypedValue } from '../utils';

interface UseTableColumnsProps {
  columns: DBColumn[];
  page: number;
  onRowSelectionChange: (
    cell: CellContext<Record<string, string | number>, any>,
    e: React.MouseEvent<Element, MouseEvent>,
  ) => void;
}

const MIN_TOOLTIP_LENGTH = 30;
const fallbackData = [] as any[];

export const useTableColumns = ({ columns, onRowSelectionChange, page }: UseTableColumnsProps) => {
  const clipboard = useClipboard();
  const { showSuccess } = useAppNotifications();

  const handleCellClick = useCallback(
    (value: any) => {
      clipboard.copy(value);
      showSuccess({
        title: 'Copied to clipboard',
        message: '',
        autoClose: 800,
      });
    },
    [clipboard, showSuccess],
  );

  const tableColumns = useMemo(
    (): ColumnDef<Record<string, string | number>, any>[] =>
      columns?.length
        ? [
            {
              header: '#',
              minSize: 46,
              size: 46,
              cell: (props) => {
                const rowIndex = props.row.index;
                const pageIndex = page;
                const index = pageIndex * 100 + rowIndex + 1;
                const onRowClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
                  onRowSelectionChange(props, e);
                };

                return (
                  <div
                    onMouseDown={onRowClick}
                    data-testid={setDataTestId(`data-table-cell-value-#-${rowIndex}`)}
                    className="p-2 text-sm font-mono flex w-full justify-end"
                  >
                    {index}
                  </div>
                );
              },
            },
            ...columns.map(
              (col): ColumnDef<Record<string, string | number>, any> => ({
                accessorKey: col.name,
                header: col.name,
                meta: { type: col.sqlType },
                minSize: col.name === '#' ? 80 : 100,
                size: col.name === '#' ? 80 : 200,
                id: col.name,
                accessorFn: (row) => row[col.name],
                cell: (info: {
                  table: Table<Record<string, string | number>>;
                  row: Row<Record<string, string | number>>;
                  column: Column<Record<string, string | number>>;
                  cell: Cell<Record<string, string | number>, any>;
                  getValue: () => any;
                  renderValue: () => any;
                }) => {
                  const value = info.getValue();

                  const result = stringifyTypedValue({
                    type: col.sqlType,
                    value,
                  });

                  const cellValue = (
                    <div
                      data-testid={setDataTestId(
                        `data-table-cell-value-${col.name}-${info.row.index}`,
                      )}
                      className={cn(
                        'text-sm p-2',
                        ['integer', 'date', 'number', 'bigint'].includes(col.sqlType) &&
                          'justify-end font-mono flex w-full',
                      )}
                      onClick={(e) => e.shiftKey && handleCellClick(result)}
                    >
                      {result}
                    </div>
                  );

                  if (typeof result === 'string' && result.length > MIN_TOOLTIP_LENGTH) {
                    return (
                      <Tooltip keepMounted={false} withinPortal={false} label={result}>
                        {cellValue}
                      </Tooltip>
                    );
                  }

                  return cellValue;
                },
              }),
            ),
          ]
        : fallbackData,
    [columns, onRowSelectionChange, page],
  );

  return tableColumns;
};
