import { DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import type { SchemaMetadata, SchemaTable } from '@pondpilot/flowscope-core';
import { SYSTEM_DUCKDB_SCHEMAS } from '@utils/duckdb/identifier';

const shouldSkipTable = (tableName: string) =>
  tableName.startsWith('duckdb_') ||
  tableName.startsWith('sqlite_') ||
  tableName.startsWith('pragma_');

export type FlowScopeSchemaDefaults = {
  defaultCatalog?: string | null;
  defaultSchema?: string | null;
};

export const convertToFlowScopeSchema = (
  databases: DataBaseModel[],
  defaults: FlowScopeSchemaDefaults = {},
): SchemaMetadata => {
  const tables: SchemaTable[] = [];
  const defaultCatalog = defaults.defaultCatalog ?? PERSISTENT_DB_NAME;
  const defaultSchema = defaults.defaultSchema ?? 'main';

  databases.forEach((db) => {
    if (['system', 'temp'].includes(db.name)) return;

    db.schemas.forEach((schema) => {
      if (SYSTEM_DUCKDB_SCHEMAS.includes(schema.name)) return;

      schema.objects.forEach((table) => {
        if (shouldSkipTable(table.name)) return;

        tables.push({
          catalog: db.name,
          schema: schema.name,
          name: table.name,
          columns: table.columns.map((col) => ({
            name: col.name,
            dataType: col.sqlType,
          })),
        });
      });
    });
  });

  return {
    defaultCatalog,
    defaultSchema,
    searchPath: [{ catalog: defaultCatalog, schema: defaultSchema }],
    tables,
  };
};
