export const datasetFileExts = [
  'csv',
  'json',
  'txt',
  'duckdb',
  'sqlite',
  'postgresql',
  'parquet',
  'arrow',
  'xlsx',
  'url',
] as const;

export type DatasetFileExt = (typeof datasetFileExts)[number];

export function isDatasetFileExt(x: unknown): x is DatasetFileExt {
  return datasetFileExts.includes(x as DatasetFileExt);
}

export const datasetMimeTypes = [
  'text/csv',
  'application/json',
  'text/plain',
  'application/duckdb',
  'application/sqlite',
  'application/postgresql',
  'application/parquet',
  'application/arrow',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/x-uri',
];

export type DatasetMimeType = (typeof datasetMimeTypes)[number];

export function isDatasetMimeType(x: unknown): x is DatasetMimeType {
  return datasetMimeTypes.includes(x as DatasetMimeType);
}

export const datasetExtMap: Record<DatasetFileExt, DatasetMimeType> = {
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  duckdb: 'application/duckdb',
  sqlite: 'application/sqlite',
  postgresql: 'application/postgresql',
  parquet: 'application/parquet',
  arrow: 'application/arrow',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  url: 'text/x-uri', // remote sources
};

export type Dataset = {
  kind: 'DATASET';
  mimeType: DatasetMimeType;
  ext: DatasetFileExt;
  handle: FileSystemFileHandle;
  path: string;
  name: string;
};

// ---------- Code Ext files ----------- //
/**
 * Only support sql for now
 */
export const codeFileExts = ['sql'] as const;

type CodeFileExt = (typeof codeFileExts)[number];

export function isCodeFileExt(x: unknown): x is CodeFileExt {
  return codeFileExts.includes(x as CodeFileExt);
}

// ------ Code Mime Types ------ //
export const codeMimeTypes = ['text/sql'] as const;

type CodeMimeType = (typeof codeMimeTypes)[number];

export function isCodeMimeType(mimeType: unknown): mimeType is CodeMimeType {
  return codeMimeTypes.includes(mimeType as CodeMimeType);
}

export const codeExtMap: Record<CodeFileExt, CodeMimeType> = {
  sql: 'text/sql',
};

export type CodeSource = {
  kind: 'CODE';
  mimeType: CodeMimeType;
  ext: CodeFileExt;
  handle: FileSystemFileHandle;
  path: string;
};

/**
 * Each code file and its state including within the tabs.
 */
export type CodeEditor = CodeSource & {
  handle: FileSystemFileHandle;
  content: string;
};

export type AppStateModel = {
  status: 'initializing_worker' | 'loading_session' | 'ready' | 'error';
  sessionDirId: string;
  directoryHandle: FileSystemDirectoryHandle | null;
  editors: CodeEditor[];
  sources: Dataset[];
};

type DataSource = {
  filename: string;
  type: 'FILE_HANDLE';
  entry: FileSystemFileHandle;
};

export type AddDataSourceProps = DataSource[];

export type SaveEditorProps = {
  content: string;
  path: string;
};

export type SaveEditorResponse = SaveEditorProps & {
  handle: FileSystemFileHandle | undefined;
  error: Error | null;
};

interface TableModel {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
  }[];
}
interface SchemaModel {
  name: string;
  tables: TableModel[];
}

export interface DataBaseModel {
  name: string;
  schemas: SchemaModel[];
}

export type Limit = 100 | 1000 | 10000;
