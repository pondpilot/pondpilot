import { NewId } from './new-id';

export type NormalizedSQLType =
  // Any precision floating point type
  | 'float'
  // Any fixed precision decimal type
  | 'decimal'
  // Any integer except for bigint (int 8)
  | 'integer'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'timestamptz'
  | 'time'
  | 'timetz'
  // Any interval type (for simplicity)
  | 'interval'
  // Any fixed or variable length string/text type
  | 'string'
  | 'bytes'
  | 'bitstring'
  | 'array'
  | 'object'
  | 'other';

export type FormattedValueType = 'regular' | 'null' | 'error';
export type FormattedValue = {
  type: FormattedValueType;
  formattedValue: string;
};

export type SortOrder = 'asc' | 'desc' | null;

export type ColumnSortSpec = {
  column: string;
  order: SortOrder;
};

export type ColumnSortSpecList = ColumnSortSpec[];

export type DBColumnId = NewId<'DBColumnId'>;

export interface DBColumn {
  name: string;
  databaseType: string;
  nullable: boolean;
  sqlType: NormalizedSQLType;
  id: DBColumnId;
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
export type DataCell = any;
export type DataRow = Record<DBColumnId, DataCell>;
export type DataTable = DataRow[];

// This is the size of the batch that arro stream reader returns as of time of writing.
export const ARROW_STREAMING_BATCH_SIZE = 2048;

// CSV file processing limits for DuckDB
export const CSV_MAX_LINE_SIZE = 20 * 1024 * 1024; // 20MB - Maximum size for a single line in CSV files
export const CSV_MAX_LINE_SIZE_MB = CSV_MAX_LINE_SIZE / (1024 * 1024); // Convenience constant for display (20)

export interface DBFunctionsMetadata {
  function_name: string;
  description: string | null;
  parameters: string[];
  examples: string[] | null;
  internal: boolean;
}
