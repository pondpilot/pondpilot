import { describe, expect, it } from '@jest/globals';
import { getGSheetPublicReadMacros } from '@utils/gsheet-public-read';

describe('getGSheetPublicReadMacros', () => {
  it('returns Google Sheets helper and read macros', () => {
    const macros = getGSheetPublicReadMacros();

    expect(macros).toHaveLength(4);
    expect(macros[0]).toContain('CREATE OR REPLACE MACRO gsheet_spreadsheet_id');
    expect(macros[1]).toContain('CREATE OR REPLACE MACRO gsheet_public_csv_url');
    expect(macros[2]).toContain('CREATE OR REPLACE MACRO read_gsheet_public');
    expect(macros[3]).toContain('CREATE OR REPLACE MACRO read_gsheet_authorized');
  });

  it('includes spreadsheet id and gid extraction logic', () => {
    const [idMacro, urlMacro] = getGSheetPublicReadMacros();

    expect(idMacro).toContain('spreadsheets/d/([a-zA-Z0-9-_]+)');
    expect(idMacro).toContain('^([a-zA-Z0-9-_]{20,})$');
    expect(urlMacro).toContain('[?&#]gid=([0-9]+)');
    expect(urlMacro).toContain('sheet := NULL');
    expect(urlMacro).toContain('range := NULL');
    expect(urlMacro).toContain('/export?format=csv');
  });
});
