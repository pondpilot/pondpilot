import { CodeSource, Dataset } from '@models/common';

export const formatNumber = (value: number): string => {
  if (Number.isNaN(value as number)) return '';

  const formatter = new Intl.NumberFormat('en-UK', {
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
};

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

export const findUniqueQueryFileName = async (
  name: string,
  checkIfExists: (name: string) => boolean,
) => {
  let counter = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currentName = `${name}${counter > 0 ? `_${counter}` : ''}`;
    const exists = checkIfExists(currentName);

    if (!exists) break;
    counter += 1;
  }

  return `${name}${counter > 0 ? `_${counter}` : ''}`;
};

/**
 * Helper to get the session directory handle from `navigator.storage`.
 */
export const getSessionDirectory = async (sessionDirId = 'main') => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(sessionDirId, { create: true });
  return dir;
};

export const replaceSpecialChars = (str: string): string =>
  str.trim().replace(/[^a-zA-Z0-9]/g, '_');

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

export const getFileNameWithExt = (name: string, ext: string) => (ext ? `${name}.${ext}` : name);
