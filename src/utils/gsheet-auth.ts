import { toDuckDBIdentifier } from './duckdb/identifier';
import { quote } from './helpers';

const GSHEET_HTTP_SECRET_PREFIX = 'pondpilot_gsheet_http_';
const SPREADSHEET_ID_FORMAT = /^[a-zA-Z0-9-_]+$/;

export function buildGSheetHttpSecretName(spreadsheetId: string, connectionKey?: string): string {
  const suffix = connectionKey ? `_${validateSpreadsheetId(connectionKey)}` : '';
  return `${GSHEET_HTTP_SECRET_PREFIX}${validateSpreadsheetId(spreadsheetId)}${suffix}`;
}

export function validateSpreadsheetId(spreadsheetId: string): string {
  if (!spreadsheetId || !SPREADSHEET_ID_FORMAT.test(spreadsheetId)) {
    throw new Error(`Invalid spreadsheet ID format: ${spreadsheetId}`);
  }
  return spreadsheetId;
}

export function buildGSheetSpreadsheetHttpScope(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${validateSpreadsheetId(spreadsheetId)}/`;
}

export function buildCreateGSheetHttpSecretQuery(
  secretName: string,
  accessToken: string,
  spreadsheetId: string,
): string {
  return `CREATE OR REPLACE SECRET ${toDuckDBIdentifier(secretName)} (TYPE HTTP, PROVIDER CONFIG, BEARER_TOKEN ${quote(
    accessToken,
    { single: true },
  )}, SCOPE (${quote(buildGSheetSpreadsheetHttpScope(spreadsheetId), { single: true })}))`;
}

export function buildCreateGSheetSecretQuery(secretName: string, accessToken: string): string {
  return `CREATE OR REPLACE SECRET ${toDuckDBIdentifier(secretName)} (TYPE GSHEET, PROVIDER ACCESS_TOKEN, ACCESS_TOKEN ${quote(
    accessToken,
    { single: true },
  )})`;
}

export function buildDropGSheetHttpSecretQuery(secretName: string): string {
  return `DROP SECRET IF EXISTS ${toDuckDBIdentifier(secretName)}`;
}

export function resolveGSheetAccessToken(
  data: Record<string, string> | undefined,
): string | undefined {
  if (!data) {
    return undefined;
  }

  const token = (data.accessToken ?? data.token ?? '').trim();
  return token || undefined;
}
