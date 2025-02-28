import { tableToIPC } from 'apache-arrow';
import { AddDataSourceProps, AppStateModel } from 'models';

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

export interface RenameDataSourceProps {
  path: string;
  newPath: string;
}

export interface DeleteDataSourceProps {
  paths: string[];
  type: 'dataset' | 'query';
}

export type AddDataSourceBase = {
  entries: AddDataSourceProps;
};

export interface TabModel {
  id: string;
  mode: 'view' | 'query';
  path: string;
  stable: boolean;
}

export type AddTabProps = Omit<TabModel, 'id'>;
export type ChangeTabProps = Omit<TabModel, 'id' | 'stable'> & {
  stable?: boolean;
  createNew?: boolean;
};

export interface DBWorkerAPIType {
  initDB: () => Promise<void>;
  runQuery: ({ query, hasLimit }: DBRunQueryProps) => Promise<RunQueryResponse>;
  registerFileHandleAndCreateDBInstance: (
    fileName: string,
    handle: FileSystemFileHandle,
  ) => Promise<void>;
  dropFilesAndDBInstances: (paths: string[], type: 'database' | 'view') => Promise<void>;
  getDBUserInstances: (type: 'databases' | 'views') => Promise<Uint8Array>;
  getTablesAndColumns: (database?: string, schema?: string) => Promise<Uint8Array<ArrayBufferLike>>;
}

export interface OnSetOrderProps {
  tabs: TabModel[];
  activeTabIndex: number;
}

export interface CreateQueryFileProps {
  entities: { name: string; content?: string }[];
  openInNewTab?: boolean;
}
