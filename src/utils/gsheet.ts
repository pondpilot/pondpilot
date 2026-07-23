import { PERSISTENT_DB_NAME } from '@models/db-persistence';

import { toDuckDBIdentifier } from './duckdb/identifier';
import { quote } from './helpers';

/** Label prefix used when storing Google Sheet secrets. Shared between creation and GC. */
export const GSHEET_SECRET_LABEL_PREFIX = 'Google Sheet:';

const SPREADSHEET_URL_ID_REGEX = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const SPREADSHEET_ID_ONLY_REGEX = /^([a-zA-Z0-9-_]{20,})$/;

export function extractGSheetSpreadsheetId(sheetRef: string): string | null {
  const normalized = sheetRef.trim();
  if (!normalized) return null;

  const urlMatch = normalized.match(SPREADSHEET_URL_ID_REGEX);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  const idOnlyMatch = normalized.match(SPREADSHEET_ID_ONLY_REGEX);
  if (idOnlyMatch && idOnlyMatch[1]) {
    return idOnlyMatch[1];
  }

  return null;
}

export function buildGSheetSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export function buildGSheetXlsxExportUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
}

export function buildGSheetCsvExportUrl(spreadsheetId: string, sheetName?: string): string {
  const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  return sheetName ? `${baseUrl}&sheet=${encodeURIComponent(sheetName)}` : baseUrl;
}

/**
 * Creates a DuckDB view query for a specific Google Sheet worksheet.
 *
 * Uses the gsheets extension's `read_gsheet(...)` table function.
 */
export function createGSheetSheetViewQuery(
  spreadsheetRef: string,
  sheetName: string | undefined,
  viewName: string,
  readFunctionName = 'read_gsheet',
  secretName?: string,
): string {
  const readFunctionSql = readFunctionName
    .split('.')
    .map((part) => toDuckDBIdentifier(part))
    .join('.');

  const sheetArgument = sheetName ? `, sheet:=${quote(sheetName, { single: true })}` : '';
  const secretArgument = secretName ? `, secret_name:=${quote(secretName, { single: true })}` : '';
  const qualifiedViewName = [PERSISTENT_DB_NAME, 'main', viewName]
    .map(toDuckDBIdentifier)
    .join('.');
  return `CREATE OR REPLACE VIEW ${qualifiedViewName} AS SELECT * FROM ${readFunctionSql}(${quote(
    spreadsheetRef,
    { single: true },
  )}${sheetArgument}${secretArgument});`;
}

export function buildDropGSheetSheetViewQuery(viewName: string): string {
  const qualifiedViewName = [PERSISTENT_DB_NAME, 'main', viewName]
    .map(toDuckDBIdentifier)
    .join('.');
  return `DROP VIEW IF EXISTS ${qualifiedViewName}`;
}

/**
 * Public reads deliberately use the CSV export endpoint instead of
 * read_gsheet(). The extension auto-selects any ambient GSHEET secret when no
 * secret name is provided, which could accidentally couple a public source to
 * an unrelated authenticated connection.
 */
export function createPublicGSheetViewQuery(
  spreadsheetId: string,
  sheetName: string | undefined,
  viewName: string,
): string {
  const qualifiedViewName = [PERSISTENT_DB_NAME, 'main', viewName]
    .map(toDuckDBIdentifier)
    .join('.');
  const exportUrl = buildGSheetCsvExportUrl(spreadsheetId, sheetName);
  return `CREATE OR REPLACE VIEW ${qualifiedViewName} AS SELECT * FROM read_csv(${quote(exportUrl, {
    single: true,
  })}, header=true);`;
}
