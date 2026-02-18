const SPREADSHEET_URL_ID_REGEX = 'spreadsheets/d/([a-zA-Z0-9-_]+)';
const SPREADSHEET_ID_ONLY_REGEX = '^([a-zA-Z0-9-_]{20,})$';
const SHEET_GID_REGEX = '[?&#]gid=([0-9]+)';

/**
 * Returns SQL macros for reading Google Sheets via CSV export URLs.
 *
 * These macros do not require the gsheets extension:
 * - gsheet_public_csv_url(url): normalize a Google Sheets URL to CSV export URL
 * - read_gsheet_public(url): table macro wrapper over read_csv_auto(...)
 * - read_gsheet_authorized(url): same as public read, expects HTTP bearer secret
 * - read_gsheet(url): fallback alias for compatibility with gsheets extension syntax
 */
export function getGSheetPublicReadMacros(): string[] {
  return [
    `
      CREATE OR REPLACE MACRO gsheet_spreadsheet_id(sheet_ref) AS (
        CASE
          WHEN regexp_extract(sheet_ref, '${SPREADSHEET_URL_ID_REGEX}', 1) <> '' THEN
            regexp_extract(sheet_ref, '${SPREADSHEET_URL_ID_REGEX}', 1)
          WHEN regexp_extract(sheet_ref, '${SPREADSHEET_ID_ONLY_REGEX}', 1) <> '' THEN
            regexp_extract(sheet_ref, '${SPREADSHEET_ID_ONLY_REGEX}', 1)
          ELSE ''
        END
      )
    `,
    `
      CREATE OR REPLACE MACRO gsheet_public_csv_url(sheet_ref) AS (
        CASE
          WHEN gsheet_spreadsheet_id(sheet_ref) = '' THEN sheet_ref
          ELSE
            'https://docs.google.com/spreadsheets/d/' ||
            gsheet_spreadsheet_id(sheet_ref) ||
            '/export?format=csv' ||
            CASE
              WHEN regexp_extract(sheet_ref, '${SHEET_GID_REGEX}', 1) = '' THEN ''
              ELSE '&gid=' || regexp_extract(sheet_ref, '${SHEET_GID_REGEX}', 1)
            END
        END
      )
    `,
    `
      CREATE OR REPLACE MACRO read_gsheet_public(sheet_ref) AS TABLE
        SELECT * FROM read_csv_auto(gsheet_public_csv_url(sheet_ref))
    `,
    `
      CREATE OR REPLACE MACRO read_gsheet_authorized(sheet_ref) AS TABLE
        SELECT * FROM read_csv_auto(gsheet_public_csv_url(sheet_ref))
    `,
    `
      CREATE OR REPLACE MACRO read_gsheet(sheet_ref) AS TABLE
        SELECT * FROM read_gsheet_authorized(sheet_ref)
    `,
  ];
}
