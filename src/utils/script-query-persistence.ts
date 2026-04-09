import { DataBaseModel } from '@models/db';
import { SYSTEM_DATABASE_NAME } from '@models/data-source';

const escapedSystemDatabaseName = SYSTEM_DATABASE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const systemDatabaseReferencePattern = new RegExp(
  `\\b${escapedSystemDatabaseName}\\s*\\.\\s*main\\s*\\.`,
  'i',
);

export function isSystemDatabaseEmpty(databaseMetadata: Map<string, DataBaseModel>): boolean {
  const systemDb = databaseMetadata.get(SYSTEM_DATABASE_NAME);
  const mainSchema = systemDb?.schemas.find((schema) => schema.name === 'main');

  return (mainSchema?.objects.length ?? 0) === 0;
}

export function shouldResetRestoredScriptQuery(
  lastExecutedQuery: string | null,
  databaseMetadata: Map<string, DataBaseModel>,
): boolean {
  if (!lastExecutedQuery) {
    return false;
  }

  return (
    isSystemDatabaseEmpty(databaseMetadata) &&
    systemDatabaseReferencePattern.test(lastExecutedQuery)
  );
}
