import { AllDataSourceFileExt, DataSourceMimeType } from './file-system';

export type Dataset = {
  kind: 'DATASET';
  mimeType: DataSourceMimeType;
  ext: AllDataSourceFileExt;
  handle: FileSystemFileHandle;
  path: string;
  name: string;
  id: string;
};

type DataSource = {
  filename: string;
  type: 'FILE_HANDLE';
  entry: FileSystemFileHandle;
};

export type AddDataSourceProps = DataSource[];

interface TableOrViewModel {
  name: string;
  label?: string;
  type?: 'table' | 'view';
  columns: {
    name: string;
    type: string;
    nullable: boolean;
  }[];
}
interface SchemaModel {
  name: string;
  tables: TableOrViewModel[];
}

export interface DataBaseModel {
  name: string;
  schemas: SchemaModel[];
}

export type Limit = 100 | 1000 | 10000;

export type TabType = 'query' | 'file';
export type LoadingState = 'fetching' | 'error' | 'success' | 'pending';
export type SortOrder = 'asc' | 'desc' | null;

export interface Pagination {
  page: number;
}

export interface TableSort {
  column: string;
  order: SortOrder;
}

export interface DuckDBView {
  database_name: string;
  schema_name: string;
  view_name: string;
  sql: string;
  sourceId: string;
  comment: string;
}

export interface DuckDBDatabase {
  database_name: string;
  path: string;
  comment: string;
  internal: boolean;
  type: string;
  readonly: string;
}
