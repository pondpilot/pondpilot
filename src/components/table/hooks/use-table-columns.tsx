/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { Cell, CellContext, Column, ColumnDef, Row, Table } from '@tanstack/react-table';
import React from 'react';
import { Tooltip } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { setDataTestId } from '@utils/test-id';
import { DBColumn } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { stringifyTypedValue } from '@utils/db';

interface UseTableColumnsProps {
  schema: DBColumn[];
  page: number;
  initialCoulmnSizes?: Record<string, number>;
  onRowSelectionChange: (
    cell: CellContext<Record<string, string | number>, any>,
    e: React.MouseEvent<Element, MouseEvent>,
  ) => void;
}

const MIN_TOOLTIP_LENGTH = 30;
const fallbackData = [] as any[];

export const getTableColumns = ({
  schema,
  onRowSelectionChange,
  page,
  initialCoulmnSizes,
}: UseTableColumnsProps) => {
  const tableColumns: ColumnDef<Record<string, string | number>, any>[] = schema?.length
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
        ...schema.map(
          (col): ColumnDef<Record<string, string | number>, any> => ({
            accessorKey: col.name,
            header: col.name,
            meta: { type: col.sqlType },
            minSize: col.name === '#' ? 80 : 100,
            size: col.name === '#' ? 80 : initialCoulmnSizes?.[col.name] || 200,
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
                  data-testid={setDataTestId(`data-table-cell-value-${col.name}-${info.row.index}`)}
                  className={cn(
                    'text-sm p-2',
                    ['integer', 'date', 'number', 'bigint'].includes(col.sqlType) &&
                      'justify-end font-mono flex w-full',
                  )}
                  onClick={(e) =>
                    e.shiftKey &&
                    copyToClipboard(result, {
                      showNotification: true,
                      notificationTitle: 'Selected cell copied to clipboard',
                    })
                  }
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
    : fallbackData;

  return tableColumns;
};
