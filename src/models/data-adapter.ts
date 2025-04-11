import { AsyncRecordBatchStreamReader, TypeMap } from 'apache-arrow';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { ArrowColumn } from './arrow';
import { ColumnSortSpecList } from './db';

export type DataViewCacheKey = string & { readonly _: unique symbol };

export type DataViewCacheItem = {
  key: DataViewCacheKey;
  dataPage: number;
  rowFrom: number;
  rowTo: number;
  columns: ArrowColumn[];
  data: Record<string, any>[];
};

export interface DataAdapterApi<T extends TypeMap = any> {
  /**
   * A paersistent cache key, that can be used to store and later
   * retrieve the data for the same underlying data source after app restart.
   */
  getCacheKey: () => DataViewCacheKey;

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
