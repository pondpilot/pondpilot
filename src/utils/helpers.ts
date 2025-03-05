/* eslint-disable no-plusplus */
import { openDB } from 'idb';
import { CodeSource, Dataset } from 'models';

import JSZip from 'jszip';

export const formatNumber = (value: number): string => {
  if (Number.isNaN(value as number)) return '';

  const formatter = new Intl.NumberFormat('en-UK', {
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
};

export const FILE_HANDLE_DB_NAME = 'FileHandlesDB';
export const TABS_DB_NAME = 'TabsDB';
export const FILE_HANDLE_STORE_NAME = 'fileHandles';
export const TABS_STORE_NAME = 'tabs';

export function getSupportedMimeType(
  name: string,
):
  | Pick<Dataset, 'mimeType' | 'kind' | 'ext'>
  | Pick<CodeSource, 'mimeType' | 'kind' | 'ext'>
  | null {
  const lastDot = name.lastIndexOf('.'); // allow index.worker.ts
  if (lastDot === -1) {
    return null;
  }
  const ext = name.slice(lastDot + 1);
  if (!ext) return null;

  switch (ext) {
    case 'parquet':
      return {
        mimeType: 'application/parquet',
        kind: 'DATASET',
        ext: 'parquet',
      };
    case 'csv':
      return { mimeType: 'text/csv', kind: 'DATASET', ext: 'csv' };
    case 'json':
      return { mimeType: 'application/json', kind: 'DATASET', ext: 'json' };
    case 'sql':
      return { mimeType: 'text/sql', kind: 'CODE', ext: 'sql' };
    case 'xlsx':
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        kind: 'DATASET',
        ext: 'xlsx',
      };

    case 'duckdb':
      return { mimeType: 'application/duckdb', kind: 'DATASET', ext: 'duckdb' };
    default:
      return null;
  }
}

export const findUniqueName = async (
  name: string,
  checkIfExists: (name: string) => Promise<boolean>,
) => {
  let counter = 0;
  const paths = name.split('.');
  const ext = paths.pop();
  const path = paths.join('.');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currentName = `${path}${counter > 0 ? `_${counter}` : ''}.${ext}`;
    const exists = await checkIfExists(currentName);

    if (!exists) break;
    counter++;
  }

  return `${path}${counter > 0 ? `_${counter}` : ''}.${ext}`;
};

/**
 * Helper to get the session directory handle from `navigator.storage`.
 */
export const getSessionDirectory = async (sessionDirId = 'main') => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(sessionDirId, { create: true });
  return dir;
};

/**
 * Exports all application files into a ZIP archive:
 * - `queries/` directory: `.sql` files from `navigator.storage`
 * - `databases/` directory: `.duckdb` files from IndexedDB
 * - `files/` directory: non-`.duckdb` files from IndexedDB
 */
export const exportApplicationFiles = async (): Promise<Blob | null> => {
  try {
    const zip = new JSZip();

    // Export queries (.sql files) from `navigator.storage`
    const queriesFolder = zip.folder('queries');
    const directory = await getSessionDirectory();
    const entries = directory.entries();
    for await (const [fileName, handle] of entries) {
      if (handle.kind === 'file' && fileName.endsWith('.sql')) {
        const file = await handle.getFile();
        const content = await file.text();
        queriesFolder?.file(fileName, content);
      }
    }

    // Open IndexedDB to access file handles
    const db = await openDB(FILE_HANDLE_DB_NAME, 1);
    const fileHandles: FileSystemFileHandle[] = await db.getAll(FILE_HANDLE_STORE_NAME);

    // Export databases (.duckdb) from IndexedDB to `databases/`
    const databasesFolder = zip.folder('databases');
    for (const handle of fileHandles) {
      if (handle.name.endsWith('.duckdb')) {
        const file = await handle.getFile();
        const content = await file.arrayBuffer();
        databasesFolder?.file(handle.name, content);
      }
    }

    // Export other files (non-`.duckdb`) from IndexedDB to `files/`
    const filesFolder = zip.folder('files');
    for (const handle of fileHandles) {
      if (!handle.name.endsWith('.duckdb')) {
        const file = await handle.getFile();
        const content = await file.arrayBuffer();
        filesFolder?.file(handle.name, content);
      }
    }

    // Generate ZIP archive as a Blob
    const archiveBlob = await zip.generateAsync({ type: 'blob' });
    return archiveBlob;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error while exporting application files: ', error);
    return null;
  }
};

export const replaceSpecialChars = (str: string): string => str.replace(/[\s#()[\].-]/g, '_');

/**
 * Creates item name by removing the file extension and replacing hyphens with underscores.
 *
 * @param {string} fileName - The name of the file with extension.
 * @returns {string} The generated view name.
 */
export const createName = (fileName: string): string => {
  const sanitize = (str: string): string => str.replace(/[- ()/]/g, '_');

  const name = sanitize(fileName.split('.')[0]);
  const ext = fileName.split('.').pop();

  return Number.isNaN(Number(name[0])) ? name : `${ext}_${name}`;
};
