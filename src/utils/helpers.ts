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

/**
 * Helper to find a unique name. Takes a base name and appends a counter to it until a unique name is found.
 *
 * @param {string} name - The base name to check.
 * @param {function} checkIfExists - A function that checks if a name exists.
 * @returns {string} - A unique name.
 * @throws {Error} - Throws an error if too many files with the same name are found.
 */
export const findUniqueName = (name: string, checkIfExists: (name: string) => boolean): string => {
  if (!checkIfExists(name)) return name;

  let counter = 1;
  let uniqueName = `${name}_${counter}`;

  while (checkIfExists(uniqueName)) {
    uniqueName = `${name}_${counter}`;
    counter += 1;

    // Prevent infinite loop
    if (counter > 10000) {
      throw new Error('Too many files with the same name');
    }
  }

  return uniqueName;
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
