import { describe, expect, it } from '@jest/globals';
import {
  buildDropGSheetSheetViewQuery,
  buildGSheetCsvExportUrl,
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  createGSheetSheetViewQuery,
  createPublicGSheetViewQuery,
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
    expect(buildGSheetSpreadsheetUrl(id)).toBe(
      'https://docs.google.com/spreadsheets/d/sheet123/edit',
    );
    expect(buildGSheetXlsxExportUrl(id)).toBe(
      'https://docs.google.com/spreadsheets/d/sheet123/export?format=xlsx',
    );
  });

  it('builds a public CSV URL with an encoded worksheet name', () => {
    expect(buildGSheetCsvExportUrl('abc123', 'Quarter 1 & Sales')).toBe(
      'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&sheet=Quarter%201%20%26%20Sales',
    );
  });

  it('builds view SQL for reading a specific worksheet via read_gsheet', () => {
    const sql = createGSheetSheetViewQuery(
      'https://docs.google.com/spreadsheets/d/sheet123/edit',
      "Roster O'Reilly",
      'student_roster',
    );

    expect(sql).toBe(
      "CREATE OR REPLACE VIEW pondpilot.main.student_roster AS SELECT * FROM read_gsheet('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet:='Roster O''Reilly');",
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
      "CREATE OR REPLACE VIEW pondpilot.main.student_roster AS SELECT * FROM read_gsheet_public('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet:='Sheet1');",
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
      "CREATE OR REPLACE VIEW pondpilot.main.student_roster AS SELECT * FROM \"system\".main.read_gsheet('https://docs.google.com/spreadsheets/d/sheet123/edit', sheet:='Sheet1');",
    );
  });

  it('omits the sheet argument when reading the first worksheet', () => {
    const sql = createGSheetSheetViewQuery('sheet123', undefined, 'first_sheet');

    expect(sql).toBe(
      "CREATE OR REPLACE VIEW pondpilot.main.first_sheet AS SELECT * FROM read_gsheet('sheet123');",
    );
  });

  it('references a named secret without putting its token in view SQL', () => {
    const sql = createGSheetSheetViewQuery(
      'sheet123',
      'Private',
      'private_sheet',
      'system.main.read_gsheet',
      'pondpilot_gsheet_http_sheet123',
    );

    expect(sql).toBe(
      "CREATE OR REPLACE VIEW pondpilot.main.private_sheet AS SELECT * FROM \"system\".main.read_gsheet('sheet123', sheet:='Private', secret_name:='pondpilot_gsheet_http_sheet123');",
    );
  });

  it('fully qualifies managed view cleanup in the persistent catalog', () => {
    expect(buildDropGSheetSheetViewQuery('private sheet')).toBe(
      'DROP VIEW IF EXISTS pondpilot.main."private sheet"',
    );
  });

  it('builds a public view that cannot inherit an ambient GSHEET secret', () => {
    expect(createPublicGSheetViewQuery('abc123', 'Employees', 'payroll')).toBe(
      "CREATE OR REPLACE VIEW pondpilot.main.payroll AS SELECT * FROM read_csv('https://docs.google.com/spreadsheets/d/abc123/export?format=csv&sheet=Employees', header=true);",
    );
  });
});
