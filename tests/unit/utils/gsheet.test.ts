import { describe, expect, it } from '@jest/globals';
import {
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  createGSheetSheetViewQuery,
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

  it('builds view SQL for reading a specific worksheet via read_gsheet', () => {
    const sql = createGSheetSheetViewQuery(
      'https://docs.google.com/spreadsheets/d/sheet123/edit',
      "Roster O'Reilly",
      'student_roster',
    );

    expect(sql).toBe(
      "CREATE OR REPLACE VIEW student_roster AS SELECT * FROM read_gsheet('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet='Roster O''Reilly');",
    );
  });

  it('can target a specific read function name', () => {
    const sql = createGSheetSheetViewQuery(
      'https://docs.google.com/spreadsheets/d/sheet123/edit',
      'Sheet1',
      'student_roster',
      'read_gsheet_public',
    );

    expect(sql).toBe(
      "CREATE OR REPLACE VIEW student_roster AS SELECT * FROM read_gsheet_public('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet='Sheet1');",
    );
  });

  it('can target a qualified read function name', () => {
    const sql = createGSheetSheetViewQuery(
      'https://docs.google.com/spreadsheets/d/sheet123/edit',
      'Sheet1',
      'student_roster',
      'system.main.read_gsheet',
    );

    expect(sql).toBe(
      `CREATE OR REPLACE VIEW student_roster AS SELECT * FROM "system".main.read_gsheet('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet='Sheet1');`,
    );
  });
});
