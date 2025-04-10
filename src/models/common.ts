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

export interface Pagination {
  page: number;
}

export interface DuckDBDatabase {
  database_name: string;
  path: string;
  comment: string;
  internal: boolean;
  type: string;
  readonly: string;
}
