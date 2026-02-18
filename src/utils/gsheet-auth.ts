import type { LocalEntryId } from '@models/file-system';

import { toDuckDBIdentifier } from './duckdb/identifier';
import { quote } from './helpers';

const GSHEET_HTTP_SECRET_PREFIX = 'pondpilot_gsheet_http_';

export function buildGSheetHttpSecretName(sourceGroupId: LocalEntryId): string {
  return `${GSHEET_HTTP_SECRET_PREFIX}${String(sourceGroupId).replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function buildGSheetSpreadsheetHttpScope(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/`;
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
