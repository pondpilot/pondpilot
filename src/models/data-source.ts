import { LocalEntryId } from './file-system';
import { NewId } from './new-id';

// We have two types of data view sources:
// 1. Persistent - these are stored in app state to allow
//    reloading the app and restoring the state. Locally added
//    non-databse files produce persistent data views.
//    In some cases we have non-flat sources, like databases and
//    may later have partioned parquet files, multi-file csv views etc.
// 2. Transient - these are not stored as a separate object in app state and
//    are created on the fly by the Tab. As of today this is only
//    scripts, that needs to store last executed query, which is stored
//    in the tab state directly.

export type PersistentDataSourceId = NewId<'PersistentDataSourceId'>;

/**
 * Every single file data source must have a unique id & and a reference to
 * the file providing the data.
 */
interface SingleFileDataSourceBase {
  id: PersistentDataSourceId;

  /**
   * Unique identifier for the file providing the data. One file can provide
   * multiple data views (e.g. multiple sheets in a spreadsheet).
   */
  fileSourceId: LocalEntryId;
}

/**
 * Flat file data source is a data source that is a 1-1 mapping
 * from a single file to a single data view.
 * It is a flat file, like CSV or Parquet.
 *
 * Note, that a folder of CSVs, or Parquets etc. can also be read
 * as a single partitioned data source. These are not supported
 * yet, but will be a different type of data source.
 */
interface FlatFileDataSource extends SingleFileDataSourceBase {
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

export interface JSONView extends FlatFileDataSource {
  readonly type: 'json';
}

export interface ParquetView extends FlatFileDataSource {
  readonly type: 'parquet';
}

/**
 * Xlsx themselves are non-flat file data source as it may contain
 * multiple sheets. But we create a persistent data source for each
 * sheet for user convenience, creating managed views and reconciling
 * sheet vs. views changes on init/external file change.
 */
export interface XlsxSheetView extends FlatFileDataSource {
  readonly type: 'xlsx-sheet';

  /**
   * Name of the sheet in the spreadsheet.
   */
  sheetName: string;
}

export type AnyFlatFileDataSource = CSVView | ParquetView | XlsxSheetView | JSONView;

export interface AttachedDB extends SingleFileDataSourceBase {
  readonly type: 'attached-db';

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
