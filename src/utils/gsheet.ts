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
