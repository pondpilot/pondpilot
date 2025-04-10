export type SortOrder = 'asc' | 'desc' | null;

export type ColumnSortSpec = {
  column: string;
  order: SortOrder;
};

export type ColumnSortSpecList = ColumnSortSpec[];

interface DBColumn {
  name: string;
  type: string;
  nullable: boolean;
}
interface DBTableOrView {
  name: string;
  /**
   * If the table or view should be shown in auto-complete
   * with something other than the name - set label.
   */
  label: string;
  type: 'table' | 'view';
  columns: DBColumn[];
}
interface DBSchema {
  name: string;
  tables: DBTableOrView[];
}

export interface DataBaseModel {
  name: string;
  schemas: DBSchema[];
}
