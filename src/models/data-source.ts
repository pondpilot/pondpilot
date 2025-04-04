import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { AsyncRecordBatchStreamReader, TypeMap } from 'apache-arrow';
import { LocalEntryId } from './file-system';

export type DataSourceId = string & { readonly _: unique symbol };

type PersistentDataSourceType = 'csv' | 'json' | 'xlsx-sheet' | 'db-table' | 'db-view';
type TransientDataSourceType = 'query-result';
type DataSourceType = PersistentDataSourceType | TransientDataSourceType;

export interface DataSource<T extends TypeMap = any> {
  readonly type: DataSourceType;
  id: DataSourceId;
  fileSourceId: LocalEntryId;

  /**
   * Name as should be shown in explorer view.
   *
   * Normally an unqualified database name of the underlying table/view in app duckdb instance.
   */
  displayName: string;

  /**
   * Returns a name that should return the data via `SELECT * FROM <name>` query.
   *
   * Normally an unqualified name for our managed views (for local file sources)
   * and a qualified name for other sources. But if/whe we allow users to
   * change default schemas, it may behave differently based on the default schema.
   */
  getQueryableName: (db: AsyncDuckDBConnection) => Promise<string>;

  /**
   * Returns a fully qualified name for the data source in the database.
   *
   * This name should work no matter what the default schema is.
   */
  getFullyQualifiedName: () => string;

  /**
   * If data source supports quick row count retrieval, returns the count.
   */
  getRowCount: (db: AsyncDuckDBConnection) => Promise<number | null>;
  getReader: (db: AsyncDuckDBConnection) => Promise<AsyncRecordBatchStreamReader<T>>;
}

export interface CSVDataSource<T extends TypeMap = any> extends DataSource<T> {
  readonly type: 'csv';
}

// TODO: should be a unio of all the cocrete data source types
export type AnyDataSource = CSVDataSource;
export type DataSourcePersistece = Omit<
  AnyDataSource,
  'getQueryableName' | 'getFullyQualifiedName' | 'getRowCount' | 'getReader'
>;
