import { LocalEntryId } from './file-system';

// We have two types of data view sources:
// 1. Persistent - these are stored in app state to allow
//    reloading the app and restoring the state. Locally added
//    non-databse files produce persistent data views.
//    In some cases we have non-flat sources, like databases and
//    may later have partioned parquet files, multi-file csv views etc.
// 2. Transient - these are not stored in app state and
//    are created on the fly in TabView local state. Besides
//    scripts, that generate transient data view on each run,
//    objects from non-flat persistent data sources, like
//    tables and views of an attached readonly database also
//    produce transient data sources for our data view. These
//    will not have a type here, but will have controller that
//    creates a DataAdapterApi for them.

export type PersistentDataSourceId = string & { readonly _: unique symbol };

interface FlatFileDataSource {
  id: PersistentDataSourceId;

  /**
   * Unique identifier for the file providing the data. One file can provide
   * multiple data views (e.g. multiple sheets in a spreadsheet).
   */
  fileSourceId: LocalEntryId;

  /**
   * Unqualified unquoted view name.
   *
   * Remember to use `toDuckDBIdentifier` to escape the name in query.
   */
  viewName: string;
}

export interface CSVView extends FlatFileDataSource {
  readonly type: 'csv';
}

export interface ParquetView extends FlatFileDataSource {
  readonly type: 'parquet';
}

export interface XlsxSheetView extends FlatFileDataSource {
  readonly type: 'xlsx-sheet';
  sheetName: string;
}

export type AnyFlatFileDataSource = CSVView | ParquetView | XlsxSheetView;

export interface AttachedDB {
  readonly type: 'attached-db';

  id: PersistentDataSourceId;

  /**
   * Unique identifier for the file providing the data.
   */
  fileSourceId: LocalEntryId;

  /**
   * Type of the database.
   */
  dbType: 'duckdb' | 'sqllite';

  /**
   * valid unique identifier used to attach db as
   */
  dbName: string;
}

export type AnyDataSource = AnyFlatFileDataSource | AttachedDB;
