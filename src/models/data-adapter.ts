import { AsyncDuckDBPooledStreamReader } from '@features/duckdb-context/duckdb-pooled-streaming-reader';
import { ColumnSortSpecList, DataTable, DBColumn, DBTableOrViewSchema } from './db';

/**
 * A custom error class that represents a cancelled data adapter operation.
 */
export class CancelledOperation extends Error {
  private readonly isUser: boolean;
  private readonly reason: string | null;

  constructor({
    isUser,
    reason = null,
  }: { isUser: true; reason: null } | { isUser: false; reason: string }) {
    super(`Operation cancelled ${isUser ? 'by user.' : `by system: ${reason}`}`);
    this.name = 'CancelledOperation';
    this.isUser = isUser;
    this.reason = reason;
  }

  /**
   * Whether the operation was cancelled by the user.
   */
  public get isUserCancelled(): boolean {
    return this.isUser;
  }

  /**
   * Whether the operation was cancelled by the system.
   */
  public get isSystemCancelled(): boolean {
    return !this.isUser;
  }

  /**
   * User friendly message with the reason for the cancellation.
   */
  public get cancellationReason(): string {
    return this.isUser ? 'User request' : this.reason || 'Internal error';
  }
}

export type DataTableSlice = {
  /**
   * A subset of the full data table.
   */
  data: DataTable;
  /**
   * The starting, 0-based row index in the full data of
   * this data slice.
   */
  rowOffset: number;
};

export type GetDataTableSliceReturnType = DataTableSlice | null;

export type RowCountInfo = {
  realRowCount: number | null;
  estimatedRowCount: number | null;
  /**
   * The number of rows that are available to be shown (from actual or
   * stale data).
   */
  availableRowCount: number;
};

export type ColumnAggregateType = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * Interface defining the API for a data adapter component.
 * This interface provides methods and properties for fetching, managing, and manipulating tabular data.
 */
export interface DataAdapterApi {
  /**
   * An ever increasing number that is incremented
   * whenever the data source is changed. Use this in components
   * that sould react when the data source is changed, but
   * not to intermediate data changes.
   *
   * See `dataVersion` for the latter.
   */
  dataSourceVersion: number;

  /**
   * An ever increasing number that is incremented
   * whenever the data is changed. Use this in components
   * that sould react to all data changes and conversely
   * avoid including this in the dependency array/props of
   * those that do not care about intermediate data changes.
   */
  dataVersion: number;

  /**
   * The current available data schema. If length is 0,
   * read as `no data available` (unlike 0 row data,
   * which may mean data is avaible, just empty).
   */
  currentSchema: DBTableOrViewSchema;

  /**
   * Whether current available data is stale or not.
   *
   * If no data available, this will be `false`.
   */
  isStale: boolean;

  /**
   * Information about possibly known total row count
   */
  rowCountInfo: RowCountInfo;

  /**
   * Either operation blocking sorting is being executed
   * or the data source does not support sorting (like
   * e.g. `explain ...` queries).
   */
  disableSort: boolean;

  /**
   * Current sort spec of the data.
   */
  sort: ColumnSortSpecList;

  /**
   * Whether data source is exhausted or not. Exhausted means
   * no more data can be read from the source.
   */
  dataSourceExhausted: boolean;

  /**
   * A user friendly list of error messages if there was an error during
   * initial creation of a data connection or data read
   */
  dataSourceError: string[];

  /**
   * Whether the data is being fetched or not.
   * This can be used to show loading indicators.
   *
   * NOTE: do not confuse with background task status. This is the main
   * data read status.
   */
  isFetchingData: boolean;

  /**
   * This will be true when the first data read after chagnes
   * to sort is in progress. `isFetchingData` will be true as well.
   */
  isSorting: boolean;

  /**
   * Whether the data read was cancelled.
   * This is set to true when the user cancelled the read
   * but will go back to false on any data read request.
   */
  dataReadCancelled: boolean;

  /**
   * Function to retrieve available data & schema for the given range
   *
   * NOTE: this may return a different range of rows than requested
   * if the necessary range is not yet available. It will attempt
   * to return as "close" to the requested range as possible.
   * Close means the widest possible range that is not larger than
   * requested starting at the maximum available row index not
   * greater than `rowFrom`.
   *
   * @param rowFrom The starting row index (inclusive)
   * @param rowTo The ending row index (exclusive)
   * @returns An object containing the schema, data, row range, and a flag indicating if the data is stale
   */
  getDataTableSlice: (rowFrom: number, rowTo: number) => GetDataTableSliceReturnType;

  /**
   * Function to retrieve all data from the data source.
   *
   * @param columns The columns to include in the result. If null, all columns will be included.
   *        NOTE: more columns may be returned than requested for optimization, always make sure
   *        to subset the result to the requested columns.
   * @throws CancelledOperation if the operation was cancelled
   * @returns A promise that resolves to a DataTable object containing all data
   */
  getAllTableData: (columns: DBColumn[] | null) => Promise<DataTable>;

  /**
   * Toggles the sort order of the data by iterating over the current
   * sort of the given column name.
   *
   * NOTE: this will implicitly cancel any current reads and aggregation
   * operations, reset the actual data (but will keep it as stale).
   */
  toggleColumnSort: (columnName: string) => void;

  /**
   * Calculates the aggregate of a column using the specified aggregation type.
   *
   * @throws CancelledOperation if the operation was cancelled
   * @returns A promise that resolves to the result of the aggregation.
   *          undefined is returned if the operation was cancelled.
   */
  getColumnAggregate: (
    columnName: string,
    aggType: ColumnAggregateType,
  ) => Promise<any | undefined>;

  /**
   * Cancels the current data read and prevents further reads
   * until user asks for more data by paging/scrolling
   */
  cancelDataRead: () => void;

  /**
   * Resets the data read cancelled state. This is used to
   * acknowledge that the downstream code also reacted to
   * the cancellation and wants to be able to start a new read.
   */
  ackDataReadCancelled: () => void;
}

/**
 * Type definitions for internal functions that perform various data related queries.
 */
export interface DataAdapterQueries {
  /**
   * If data source supports quick precise row count retrieval, returns the count.
   */
  getRowCount?: (abortSignal: AbortSignal) => Promise<{ value: number; aborted: boolean }>;

  /**
   * If data source supports quick estimated row count retrieval, returns the count.
   */
  getEstimatedRowCount?: (abortSignal: AbortSignal) => Promise<{ value: number; aborted: boolean }>;

  /**
   * Returns a streaming reader supporting user defined sort.
   *
   * Only one of `getSortableReader` or `getReader` is necessary, with
   * `getSortableReader` being preferred.
   *
   * If both are missing it essentially means no data source exists.
   */
  getSortableReader?: (sort: ColumnSortSpecList) => Promise<AsyncDuckDBPooledStreamReader<any>>;

  /**
   * Returns a streaming reader.
   *
   * Only one of `getSortableReader` or `getReader` is necessary, with
   * `getSortableReader` being preferred.
   *
   * If both are missing it essentially means no data source exists.
   */
  getReader?: () => Promise<AsyncDuckDBPooledStreamReader<any>>;

  /**
   * Returns column aggregate for the given column.
   */
  getColumnAggregate?: (
    columnName: string,
    aggType: ColumnAggregateType,
    abortSignal: AbortSignal,
  ) => Promise<{ value: any; aborted: boolean }>;

  /**
   * Returns column data for a subset of given columns.
   */
  getColumnsData?: (
    columns: DBColumn[],
    abortSignal: AbortSignal,
  ) => Promise<{ value: DataTable; aborted: boolean }>;
}
