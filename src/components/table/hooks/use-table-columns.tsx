/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { CellContext, ColumnDef } from '@tanstack/react-table';
import React from 'react';
import { Tooltip } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { setDataTestId } from '@utils/test-id';
import { DBColumn } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { isNumberType, stringifyTypedValue } from '@utils/db';
import { replaceSpecialChars } from '@utils/helpers';
import { TableMeta } from '../model';

interface UseTableColumnsProps {
  schema: DBColumn[];
  initialColumnSizes?: Record<string, number>;
  onRowSelectionChange: (
    cell: CellContext<Record<string, string | number>, any>,
    e: React.MouseEvent<Element, MouseEvent>,
  ) => void;
}

const MIN_TOOLTIP_LENGTH = 30;
const emptyColumns = [] as any[];

export const getTableColumns = ({
  schema,
  initialColumnSizes,
  onRowSelectionChange,
}: UseTableColumnsProps) => {
  const tableColumns: ColumnDef<Record<string, string | number>, any>[] = schema.length
    ? [
        {
          header: '#',
          minSize: 46,
          size: 46,
          cell: (props) => {
            const onRowClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
              onRowSelectionChange(props, e);
            };

            const { rowOffset } = props.table.options.meta as TableMeta;
            const index = rowOffset + props.row.index + 1;

            return (
              <div
                onMouseDown={onRowClick}
                data-testid={setDataTestId(`data-table-cell-value-#-${props.row.index}`)}
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
            size: col.name === '#' ? 80 : initialColumnSizes?.[col.name] || 200,
            id: replaceSpecialChars(col.name),
            cell: (info) => {
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
                    isNumberType(col.sqlType) && 'justify-end font-mono flex w-full',
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
    : emptyColumns;

  return tableColumns;
};
