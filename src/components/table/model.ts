import { IconType } from '@components/named-icon';
import { NormalizedSQLType, DataRow, ColumnSortSpec } from '@models/db';
import { Cell, Header } from '@tanstack/react-table';
import { ReactNode } from 'react';

export type ColumnHeaderRendererParams = {
  header: Header<DataRow, unknown>;
  isSelected: boolean;
  sort: ColumnSortSpec | null;
  onSort?: (columnId: string) => void;
  iconType: IconType;
  isIndex: boolean;
  isNumber: boolean;
  defaultNode: ReactNode;
};

export type ColumnCellRendererParams = {
  cell: Cell<DataRow, unknown>;
  formattedValue: string;
  isCellSelected: boolean;
  isColumnSelected: boolean;
  defaultNode: ReactNode;
};

export type ColumnMeta = {
  type: NormalizedSQLType;
  name: string;
  sortColumnName?: string;
  headerRenderer?: (params: ColumnHeaderRendererParams) => ReactNode;
  cellRenderer?: (params: ColumnCellRendererParams) => ReactNode;
};
export type TableMeta = { rowOffset: number };
