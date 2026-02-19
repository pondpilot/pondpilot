import { describe, expect, it } from '@jest/globals';
import { LocalEntryId } from '@models/file-system';
import {
  buildCreateGSheetHttpSecretQuery,
  buildDropGSheetHttpSecretQuery,
  buildGSheetHttpSecretName,
  buildGSheetSpreadsheetHttpScope,
  resolveGSheetAccessToken,
} from '@utils/gsheet-auth';

describe('gsheet auth utils', () => {
  it('builds deterministic secret names from source group id', () => {
    expect(buildGSheetHttpSecretName('group-1' as LocalEntryId)).toBe(
      'pondpilot_gsheet_http_group_1',
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

  it('builds drop secret SQL', () => {
    expect(buildDropGSheetHttpSecretQuery('my_secret')).toBe('DROP SECRET IF EXISTS my_secret');
  });

  it('resolves access token from payload data', () => {
    expect(resolveGSheetAccessToken({ accessToken: '  abc  ' })).toBe('abc');
    expect(resolveGSheetAccessToken({ token: 'xyz' })).toBe('xyz');
    expect(resolveGSheetAccessToken({})).toBeUndefined();
  });
});
