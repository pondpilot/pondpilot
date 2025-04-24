export type NormalizedSQLType =
  | 'number'
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'string'
  | 'bytes'
  | 'array'
  | 'object'
  | 'other';

export type SortOrder = 'asc' | 'desc' | null;

export type ColumnSortSpec = {
  column: string;
  order: SortOrder;
};

export type ColumnSortSpecList = ColumnSortSpec[];

export interface DBColumn {
  name: string;
  databaseType: string;
  nullable: boolean;
  sqlType: NormalizedSQLType;
  id: string;
  columnIndex: number;
}

export type DBTableOrViewSchema = DBColumn[];

export interface DBTableOrView {
  name: string;
  /**
   * If the table or view should be shown in auto-complete
   * with something other than the name - set label.
   */
  label: string;
  type: 'table' | 'view';
  columns: DBTableOrViewSchema;
}

export interface DBSchema {
  name: string;
  objects: DBTableOrView[];
}

export interface DataBaseModel {
  name: string;
  schemas: DBSchema[];
}

// Names here are chosen to avoid conflicts with arrow types.
export type DataRow = Record<string, any>;
export type DataTable = DataRow[];

// This is the size of the batch that arro stream reader returns as of time of writing.
export const ARROW_STREAMING_BATCH_SIZE = 2048;
