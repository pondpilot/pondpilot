import { assertNeverType } from '@utils/typing';

import { NewId } from './new-id';

export type LocalEntryId = NewId<'LocalEntryId'>;

export type LocalFileType = 'data-source' | 'code-file';

export const SUPPORTED_DATA_SOURCE_FILE_EXTS = [
  'csv',
  'xlsx',
  'duckdb',
  'parquet',
  'json',
  'sas7bdat',
  'xpt',
  'sav',
  'zsav',
  'por',
  'dta',
] as const;
export type supportedDataSourceFileExt = (typeof SUPPORTED_DATA_SOURCE_FILE_EXTS)[number];
export type supportedDataSourceFileExtArray = readonly supportedDataSourceFileExt[number][];
export type supportedFlatFileDataSourceFileExt = Exclude<supportedDataSourceFileExt, 'duckdb'>;

export type AllDataSourceFileExt =
  | 'csv'
  | 'json'
  | 'txt'
  | 'duckdb'
  | 'sqlite'
  | 'postgresql'
  | 'parquet'
  | 'arrow'
  | 'xlsx'
  | 'sas7bdat'
  | 'xpt'
  | 'sav'
  | 'zsav'
  | 'por'
  | 'dta'
  | 'url';

export const dataSourceMimeTypes = [
  'text/csv',
  'application/json',
  'text/plain',
  'application/duckdb',
  'application/sqlite',
  'application/postgresql',
  'application/parquet',
  'application/arrow',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/octet-stream',
  'application/octet-stream',
  'application/octet-stream',
  'application/octet-stream',
  'application/octet-stream',
  'text/x-uri',
] as const;

export type DataSourceMimeType = (typeof dataSourceExtMap)[AllDataSourceFileExt];

export const dataSourceExtMap = {
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  duckdb: 'application/duckdb',
  sqlite: 'application/sqlite',
  postgresql: 'application/postgresql',
  parquet: 'application/parquet',
  arrow: 'application/arrow',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Statistical file formats use octet-stream; type detection relies on file extension
  sas7bdat: 'application/octet-stream',
  xpt: 'application/octet-stream',
  sav: 'application/octet-stream',
  zsav: 'application/octet-stream',
  por: 'application/octet-stream',
  dta: 'application/octet-stream',
  url: 'text/x-uri', // remote sources
} as const;

export const ignoredFolders = new Set([
  '.GIT',
  '.SVN',
  '.HG',
  'NODE_MODULES',
  '.VENV',
  '.ENV',
  '.IDEA',
  '.VSCODE',
  '.SETTINGS',
  '.PROJECT',
  '.CACHE',
  '__PYCACHE__',
]);

// Check extension to mime type mapping has no gaps
assertNeverType<Exclude<(typeof dataSourceMimeTypes)[number], DataSourceMimeType>>();

// ---------- Code Ext files ----------- //
// Only support sql for now
export const codeFileExts = ['sql'] as const;

export type CodeFileExt = (typeof codeFileExts)[number];

// ------ Code Mime Types ------ //
export const codeMimeTypes = ['text/sql'] as const;

export type CodeMimeType = (typeof codeMimeTypes)[number];

export const codeExtMap: Record<CodeFileExt, CodeMimeType> = {
  sql: 'text/sql',
};

// Below are building blocks of a public LocalFile type. See it's definition
// for more details.
type LocalFileBase = {
  // Common fields for both file and directory
  readonly kind: 'file';
  id: LocalEntryId;
  /**
   * Name of the file without the extension.
   */
  name: string;
  parentId: LocalEntryId | null;

  /**
   * true if this entry was explicitly added via file picker.
   */
  userAdded: boolean;
  handle: FileSystemFileHandle;

  /**
   * Globally unique file name - necessary to allow registering
   * multiple files with the same name in our single duckdb instance.
   */
  uniqueAlias: string;
};

/**
 * A data source file in the local file system registered in the app.
 */
export type DataSourceLocalFile = LocalFileBase & {
  ext: supportedDataSourceFileExt;
  fileType: 'data-source';
};

type DataSourceLocalFilePersistence = Omit<DataSourceLocalFile, 'handle'> & {
  handle: FileSystemFileHandle | null;
};

/**
 * A code file in the local file system registered in the app.
 *
 * NOTE: currently unused, as we do not allow attaching local scripts yet.
 */
export type CodeLocalFile = LocalFileBase & {
  ext: CodeFileExt;
  fileType: 'code-file';
};

type CodeLocalFilePersistence = Omit<CodeLocalFile, 'handle'> & {
  handle: FileSystemFileHandle | null;
};

/**
 * A file in the local file system registered in the app.
 *
 * This type is used for entries added directly via file picker, and those
 * found in added folders recursively.
 */
export type LocalFile = DataSourceLocalFile | CodeLocalFile;

/**
 * Represents the presisted model of the local file.
 *
 * We only store handles to entries directly added via file picker,
 * thus unlike the state model, this one may not have a handle.
 *
 * Our iDB interface is responsible for converting the state to and from.
 */
export type LocalFilePersistence = DataSourceLocalFilePersistence | CodeLocalFilePersistence;

/**
 * A folder in the local file system registered in the app.
 *
 * This type is used for entries added directly via file picker, and those
 * found in added folders recursively.
 */
export type LocalFolder = {
  readonly kind: 'directory';
  id: LocalEntryId;
  name: string;
  parentId: LocalEntryId | null;

  /**
   * true if this entry was explicitly added via file picker.
   */
  userAdded: boolean;
  handle: FileSystemDirectoryHandle;

  /**
   * Globally unique name - necessary to allow registering
   * multiple top level folders with the same name
   */
  uniqueAlias: string;
};

/**
 * Represents the presisted model of the local folder.
 *
 * We only store handles to entries directly added via file picker,
 * thus unlike the state model, this one may not have a handle.
 *
 * Our iDB interface is responsible for converting the state to and from.
 */
export type LocalFolderPersistence = Omit<LocalFolder, 'handle'> & {
  handle: FileSystemDirectoryHandle | null;
};

/**
 * A file or folder in the local file system registered in the app.
 *
 * This type is used for entries added directly via file picker, and those
 * found in added folders recursively.
 */
export type LocalEntry = LocalFile | LocalFolder;
export type LocalEntryPersistence = LocalFilePersistence | LocalFolderPersistence;

/**
 * Type for files that may include webkit-specific properties
 * Used when handling files from drag & drop or file inputs in non-Chrome browsers
 */
export type WebkitFile = File & {
  readonly webkitRelativePath?: string;
};
