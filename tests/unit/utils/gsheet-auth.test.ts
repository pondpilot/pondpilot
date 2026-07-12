import { describe, expect, it } from '@jest/globals';
import {
  buildCreateGSheetHttpSecretQuery,
  buildCreateGSheetSecretQuery,
  buildDropGSheetHttpSecretQuery,
  buildGSheetHttpSecretName,
  buildGSheetSpreadsheetHttpScope,
  resolveGSheetAccessToken,
  validateSpreadsheetId,
} from '@utils/gsheet-auth';

describe('gsheet auth utils', () => {
  it('builds collision-free secret names from spreadsheet IDs', () => {
    expect(buildGSheetHttpSecretName('group-1')).toBe('pondpilot_gsheet_http_group-1');
    expect(buildGSheetHttpSecretName('group_1')).toBe('pondpilot_gsheet_http_group_1');
    expect(buildGSheetHttpSecretName('group-1', 'secret-2')).toBe(
      'pondpilot_gsheet_http_group-1_secret-2',
    );
  });

  it('builds spreadsheet scoped docs URL', () => {
    expect(buildGSheetSpreadsheetHttpScope('sheet123')).toBe(
      'https://docs.google.com/spreadsheets/d/sheet123/',
    );
  });

  it('builds create secret SQL with escaped token', () => {
    const sql = buildCreateGSheetHttpSecretQuery('my_secret', "tok'en", 'sheet123');
    expect(sql).toBe(
      "CREATE OR REPLACE SECRET my_secret (TYPE HTTP, PROVIDER CONFIG, BEARER_TOKEN 'tok''en', SCOPE ('https://docs.google.com/spreadsheets/d/sheet123/'))",
    );
  });

  it('builds a redacted gsheet access-token secret', () => {
    expect(buildCreateGSheetSecretQuery('my_secret', "tok'en")).toBe(
      "CREATE OR REPLACE SECRET my_secret (TYPE GSHEET, PROVIDER ACCESS_TOKEN, ACCESS_TOKEN 'tok''en')",
    );
  });

  it('builds drop secret SQL', () => {
    expect(buildDropGSheetHttpSecretQuery('my_secret')).toBe('DROP SECRET IF EXISTS my_secret');
  });

  it('resolves access token from payload data', () => {
    expect(resolveGSheetAccessToken({ accessToken: '  abc  ' })).toBe('abc');
    expect(resolveGSheetAccessToken({ token: 'xyz' })).toBe('xyz');
    expect(resolveGSheetAccessToken({})).toBeUndefined();
  });

  it('validates spreadsheet ID format', () => {
    expect(validateSpreadsheetId('abc123-_XYZ')).toBe('abc123-_XYZ');
    expect(() => validateSpreadsheetId('')).toThrow('Invalid spreadsheet ID format');
    expect(() => validateSpreadsheetId("abc')--")).toThrow('Invalid spreadsheet ID format');
    expect(() => validateSpreadsheetId('has spaces')).toThrow('Invalid spreadsheet ID format');
    expect(() => validateSpreadsheetId('has/slash')).toThrow('Invalid spreadsheet ID format');
  });
});
