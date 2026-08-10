import { DataRow } from '@models/db';
import { Header } from '@tanstack/react-table';

export type ColumnSizeCache = Record<string, number>;

export const sanitizeColumnSizeCache = (
  columnSizes: ColumnSizeCache | undefined,
): ColumnSizeCache => {
  if (!columnSizes) return {};

  return Object.fromEntries(
    Object.entries(columnSizes).filter(
      ([columnId, size]) => !/^\d+$/.test(columnId) && Number.isFinite(size) && size > 0,
    ),
  );
};

type TableSizing = {
  columnSizeVars: Record<string, number>;
  persistedColumnSizes: ColumnSizeCache;
};

/**
 * Build the index-based CSS variables used by table cells and the stable,
 * column-id-based map persisted between table mounts.
 */
export const getTableSizing = (headers: Header<DataRow, unknown>[]): TableSizing => {
  const columnSizeVars: Record<string, number> = {};
  const persistedColumnSizes: ColumnSizeCache = {};

  for (const header of headers) {
    const headerSize = header.getSize();

    columnSizeVars[`--header-${header.index}-size`] = headerSize;
    columnSizeVars[`--col-${header.index}-size`] = header.column.getSize();
    persistedColumnSizes[header.column.id] = headerSize;
  }

  return { columnSizeVars, persistedColumnSizes };
};
