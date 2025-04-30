/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { CellContext, ColumnDef } from '@tanstack/react-table';
import React from 'react';
import { setDataTestId } from '@utils/test-id';
import { DataRow, DBColumn } from '@models/db';
import { findUniqueName } from '@utils/helpers';
import { TableMeta } from '../model';

interface GetTableColumnsProps {
  schema: DBColumn[];
  initialColumnSizes?: Record<string, number>;
  onRowSelectionChange: (
    cell: CellContext<DataRow, any>,
    e: React.MouseEvent<Element, MouseEvent>,
  ) => void;
}

const emptyColumns = [] as any[];

export const getTableColumns = ({
  schema,
  initialColumnSizes,
  onRowSelectionChange,
}: GetTableColumnsProps) => {
  const indexColumnId = findUniqueName('__index__', (colId) =>
    schema.some((col) => col.id === colId),
  );

  const tableColumns: ColumnDef<DataRow, any>[] = schema.length
    ? [
        {
          header: '#',
          meta: { type: 'other', name: '#' },
          minSize: 46,
          size: 46,
          id: indexColumnId,
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
        ...schema.map((col): ColumnDef<DataRow, any> => {
          return {
            // should use accessor function instead of accessorKey to avoid errors with getting value from columns that contain dots in the name
            accessorFn: (row) => row[col.id],
            header: col.name,
            meta: { type: col.sqlType, name: col.name },
            minSize: 100,
            size: initialColumnSizes?.[col.name] || 200,
            id: col.id,
          };
        }),
      ]
    : emptyColumns;

  return tableColumns;
};
