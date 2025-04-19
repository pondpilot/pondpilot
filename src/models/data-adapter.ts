import { Table } from 'apache-arrow';
import { AsyncDuckDBPooledStreamReader } from '@features/duckdb-context/duckdb-pooled-streaming-reader';
import { ColumnSortSpecList, DBColumn, DBTableOrViewSchema, NormalizedSQLType } from './db';

export type OurTable = Record<string, NormalizedSQLType | null>[];

export interface DataAdapterApi {
  /**
   * Returns the schema of the table that data source yields.
   */
  getSchema: (() => Promise<DBTableOrViewSchema>) | (() => DBTableOrViewSchema);

  /**
   * If data source supports quick precise row count retrieval, returns the count.
   */
  getRowCount?: () => Promise<number>;

  /**
   * If data source supports quick estimated row count retrieval, returns the count.
   */
  getEstimatedRowCount?: () => Promise<number>;

  /**
   * Returns a reader for the data source.
   *
   * This should be used to read the data from the source.
   */
  getReader: (sort: ColumnSortSpecList) => Promise<AsyncDuckDBPooledStreamReader<any>>;
  /**
   * Returns column summary for the given column.
   */
  getCalculatedColumnSummary?: (column: DBColumn) => Promise<number>;

  /**
   * Returns column data for the given columns.
   */
  getColumnsData?: (columns: DBColumn[]) => Promise<Table<any>>;

  getAllTableData?: () => Promise<Table<any>>;
}
