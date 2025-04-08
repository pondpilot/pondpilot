import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { AsyncRecordBatchStreamReader, TypeMap } from 'apache-arrow';
import { LocalEntryId } from './file-system';
import { ColumnSortSpecList } from './db';

// We have two types of data view sources:
// 1. Persistent - these are stored in app state to allow
//    reloading the app and restoring the state. Locally added
//    non-databse files produce persistent data views.
// 2. Transient - these are not stored in app state and
//    are created on the fly in TabView local state. Besides
//    scripts, that generate transient data view on each run,
//    attached readonly databases also produce transient data views.

type DataViewType = 'persistent' | 'transient';

export type PersistentDataViewId = string & { readonly _: unique symbol };

type PersistentDataViewSourceType = 'csv' | 'json' | 'xlsx-sheet' | 'parquet';
type TransientDataViewSourceType = 'query-result' | 'db-table' | 'db-view';
type DataViewSourceType = PersistentDataViewSourceType | TransientDataViewSourceType;

export interface DataViewData {
  readonly type: DataViewType;
  readonly sourceType: DataViewSourceType;
}

export interface PersistentDataViewData extends DataViewData {
  readonly type: 'persistent';
  id: PersistentDataViewId;

  /**
   * Unique identifier for the file providing the data. One file can provide
   * multiple data views (e.g. multiple sheets in a spreadsheet).
   */
  fileSourceId: LocalEntryId;

  /**
   * Name as should be shown in explorer view.
   *
   * Normally an unqualified database name of the underlying table/view in app duckdb instance.
   */
  displayName: string;

  /**
   * Returns a valid identifier that should return the data via `SELECT * FROM <name>` query.
   *
   * Unlike displayName, this must include `"` and escaping if needed.
   *
   * Normally an unqualified name for our managed views (for local file sources)
   * and a qualified name for other sources. But if/whe we allow users to
   * change default schemas, it may behave differently based on the default schema.
   */
  queryableName: string;

  /**
   * Returns a fully qualified name (identifier) for the data source in the database.
   *
   * This name should work no matter what the default schema is.
   *
   * Just like queryableName, this must include `"` and escaping if needed.
   */
  fullyQualifiedName: string;
}

export interface CSVDataView extends PersistentDataViewData {
  readonly sourceType: 'csv';
}

export interface ParquetDataView extends PersistentDataViewData {
  readonly sourceType: 'parquet';

  /**
   * The name of the file as it is registered in the database.
   *
   * This is used to avoid reading the name from local entries map,
   * although the "source of truth" is the local entry.
   */
  registeredFileName: string;
}

export type AnyPersistentDataView = CSVDataView | ParquetDataView;

export interface DataViewAdapterApi<T extends TypeMap = any> {
  /**
   * If data source supports quick precise row count retrieval, returns the count.
   */
  getRowCount?: (dbConn: AsyncDuckDBConnection) => Promise<number>;

  /**
   * If data source supports quick estimated row count retrieval, returns the count.
   */
  getEstimatedRowCount?: (dbConn: AsyncDuckDBConnection) => Promise<number>;

  /**
   * Returns a reader for the data source.
   *
   * This should be used to read the data from the source.
   */
  getReader: (
    dbConn: AsyncDuckDBConnection,
    sort: ColumnSortSpecList,
  ) => Promise<AsyncRecordBatchStreamReader<T>>;
}
