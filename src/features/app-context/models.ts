import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { AddDataSourceProps, AppStateModel, Dataset } from '@models/common';
import { tableToIPC } from 'apache-arrow';

export interface DBRunQueryProps {
  query: string;
  limit?: number;
  offset?: number;
  hasLimit?: boolean;
  isPagination?: boolean;
  queryWithoutLimit?: string;
}
export type SessionFiles = Pick<
  AppStateModel,
  'directoryHandle' | 'sources' | 'editors' | 'sessionDirId'
>;
export interface RunQueryResponse {
  data: ReturnType<typeof tableToIPC>;
  pagination: number;
}

export interface DeleteDataSourceProps {
  paths: string[];
  type: 'dataset' | 'query';
}

export type AddDataSourceBase = {
  entries: AddDataSourceProps;
};
export type DropFilesAndDBInstancesProps = {
  ids: string[];
  type: 'databases' | 'views';
};

export interface DbAPIType {
  runQuery: ({
    query,
    hasLimit,
  }: DBRunQueryProps & { conn: AsyncDuckDBConnection }) => Promise<
    Omit<RunQueryResponse, 'originalQuery'>
  >;
  registerFileHandleAndCreateDBInstance: (
    db: AsyncDuckDB,
    conn: AsyncDuckDBConnection,
    dataset: Dataset,
  ) => Promise<void>;
  dropFilesAndDBInstances: (
    v: DropFilesAndDBInstancesProps & { conn: AsyncDuckDBConnection },
  ) => Promise<void>;
  getDBUserInstances: (
    conn: AsyncDuckDBConnection,
    type: 'databases' | 'views',
  ) => Promise<Uint8Array>;
  getTablesAndColumns: (
    conn: AsyncDuckDBConnection,
    database?: string,
    schema?: string,
  ) => Promise<Uint8Array<ArrayBufferLike>>;
}
