/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { CellContext, ColumnDef } from '@tanstack/react-table';
import React from 'react';
import { setDataTestId } from '@utils/test-id';
import { DBColumn } from '@models/db';
import { findUniqueName, replaceSpecialChars } from '@utils/helpers';
import { TableMeta } from '../model';

interface GetTableColumnsProps {
  schema: DBColumn[];
  initialColumnSizes?: Record<string, number>;
  onRowSelectionChange: (
    cell: CellContext<Record<string, string | number>, any>,
    e: React.MouseEvent<Element, MouseEvent>,
  ) => void;
}

const emptyColumns = [] as any[];

export const getTableColumns = ({
  schema,
  initialColumnSizes,
  onRowSelectionChange,
}: GetTableColumnsProps) => {
  const indexColumnId = findUniqueName('__index__', (name) =>
    schema.some((col) => replaceSpecialChars(col.name) === name),
  );
  const tableColumns: ColumnDef<Record<string, string | number>, any>[] = schema.length
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
        ...schema.map((col): ColumnDef<Record<string, string | number>, any> => {
          return {
            accessorFn: (row) => row[col.name],
            header: col.name,
            meta: { type: col.sqlType, name: col.name },
            minSize: 100,
            size: initialColumnSizes?.[col.name] || 200,
            id: replaceSpecialChars(col.name),
          };
        }),
      ]
    : emptyColumns;

  return tableColumns;
};
