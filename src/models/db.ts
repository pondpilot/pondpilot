export type SortOrder = 'asc' | 'desc' | null;

export type ColumnSortSpec = {
  column: string;
  order: SortOrder;
};

export type ColumnSortSpecList = ColumnSortSpec[];

export interface DBColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DBTableOrView {
  name: string;
  /**
   * If the table or view should be shown in auto-complete
   * with something other than the name - set label.
   */
  label: string;
  type: 'table' | 'view';
  columns: DBColumn[];
}

export interface DBSchema {
  name: string;
  objects: DBTableOrView[];
}

export interface DataBaseModel {
  name: string;
  schemas: DBSchema[];
}
