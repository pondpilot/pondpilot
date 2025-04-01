/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { CellContext, ColumnDef } from '@tanstack/react-table';
import { getColumnType } from '@utils/duckdb';
import React, { useCallback, useMemo } from 'react';
import { Tooltip } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import { ResultColumn } from '@utils/arrow/helpers';
import { setDataTestId } from '@utils/test-id';
import { dynamicTypeViewer } from '../utils';

interface UseTableColumnsProps {
  columns: ResultColumn[];
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
                const pageIndex = page - 1;
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
                meta: { type: col.type },
                minSize: col.name === '#' ? 80 : 100,
                size: col.name === '#' ? 80 : 200,
                id: col.name,
                accessorFn: (row) => row[col.name],
                cell: (info: any) => {
                  const value = info.getValue();
                  const coercedType = getColumnType(col.type);

                  const result = dynamicTypeViewer({
                    type: coercedType,
                    value,
                  });

                  const cellValue = (
                    <div
                      data-testid={setDataTestId(
                        `data-table-cell-value-${col.name}-${info.row.index}`,
                      )}
                      className={cn(
                        'text-sm p-2',
                        ['integer', 'date', 'number'].includes(col.type) &&
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
    [columns, onRowSelectionChange],
  );

  return tableColumns;
};
