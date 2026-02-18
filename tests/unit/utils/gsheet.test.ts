import { describe, expect, it } from '@jest/globals';
import {
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  extractGSheetSpreadsheetId,
} from '@utils/gsheet';

describe('gsheet utils', () => {
  it('extracts spreadsheet id from full URL', () => {
    const id = extractGSheetSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0',
    );

    expect(id).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  });

  it('extracts spreadsheet id from raw id', () => {
    const id = extractGSheetSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    expect(id).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  });

  it('returns null for invalid references', () => {
    expect(extractGSheetSpreadsheetId('https://example.com')).toBeNull();
    expect(extractGSheetSpreadsheetId('')).toBeNull();
  });

  it('builds canonical sheet and export URLs', () => {
    const id = 'sheet123';
    expect(buildGSheetSpreadsheetUrl(id)).toBe('https://docs.google.com/spreadsheets/d/sheet123/edit');
    expect(buildGSheetXlsxExportUrl(id)).toBe(
      'https://docs.google.com/spreadsheets/d/sheet123/export?format=xlsx',
    );
  });
});
