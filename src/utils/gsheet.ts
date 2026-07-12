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
  return `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${readFunctionSql}(${quote(
    spreadsheetRef,
    { single: true },
  )}${sheetArgument}${secretArgument});`;
}
