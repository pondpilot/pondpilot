import { toDuckDBIdentifier } from './duckdb/identifier';
import { quote } from './helpers';

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
 * Uses `read_gsheet(...)` so it works with:
 * - the gsheets extension table function when loaded
 * - macro fallback when extension loading is unavailable
 */
export function createGSheetSheetViewQuery(
  spreadsheetRef: string,
  sheetName: string,
  viewName: string,
  readFunctionName = 'read_gsheet',
): string {
  const readFunctionSql = readFunctionName
    .split('.')
    .map((part) => toDuckDBIdentifier(part))
    .join('.');

  return `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${readFunctionSql}(${quote(
    spreadsheetRef,
    { single: true },
  )}, sheet=${quote(sheetName, { single: true })});`;
}
