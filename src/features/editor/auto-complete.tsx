import type { SQLNamespace } from '@codemirror/lang-sql';
import { DataBaseModel } from '@models/db';
import { SYSTEM_DUCKDB_SCHEMAS } from '@utils/duckdb/identifier';
import {
  createColumnCompletion,
  createDatabaseCompletion,
  createFunctionCompletion,
  createSchemaCompletion,
  createTableOrViewCompletion,
} from '@utils/duckdb/auto-complete';

const postgresDialectFunctions = new Set([
  'avg',
  'count',
  'max',
  'min',
  'sum',
  'array_agg',
  'bit_and',
  'bit_or',
  'bool_and',
  'bool_or',
  'every',
  'string_agg',
  'corr',
  'covar_pop',
  'covar_samp',
  'regr_avgx',
  'regr_avgy',
  'regr_count',
  'regr_intercept',
  'regr_r2',
  'regr_slope',
  'regr_sxx',
  'regr_sxy',
  'regr_syy',
  'stddev',
  'stddev_pop',
  'stddev_samp',
  'variance',
  'var_pop',
  'var_samp',
  'first_value',
  'lag',
  'last_value',
  'lead',
  'nth_value',
  'ntile',
  'row_number',
  'dense_rank',
  'cume_dist',
  'percent_rank',
  'rank',
]);

export const createDuckDBCompletions = (
  functionDocs: Record<string, { syntax: string; description: string }>,
): SQLNamespace =>
  Object.entries(functionDocs).reduce((acc: any, [name]) => {
    if (postgresDialectFunctions.has(name)) {
      return acc;
    }
    acc[name] = {
      self: createFunctionCompletion(name, 2),
      children: [],
    };
    return acc;
  }, {});

/**
 * Converts database models to CodeMirror SQLNamespace format for autocompletion
 */
export const convertToSQLNamespace = (databases: DataBaseModel[]): SQLNamespace => {
  const namespace: SQLNamespace = {};

  // First add non-system tables from memory.main to top level
  const memoryDb = databases.find((db) => db.name === 'memory');
  const topTableNames: string[] = [];

  if (memoryDb) {
    const mainSchema = memoryDb.schemas.find((schema) => schema.name === 'main');
    if (mainSchema) {
      mainSchema.objects.forEach((tableOrView) => {
        // Skip system tables
        if (
          !tableOrView.name.startsWith('duckdb_') &&
          !tableOrView.name.startsWith('sqlite_') &&
          !tableOrView.name.startsWith('pragma_')
        ) {
          const columns = tableOrView.columns.map((col) => createColumnCompletion(col, 99));

          namespace[tableOrView.name] = {
            self: createTableOrViewCompletion(tableOrView, 95),
            children: columns,
          };

          topTableNames.push(tableOrView.name);
        }
      });
    }
  }

  // Add all databases except memory
  databases.forEach((db) => {
    if (['memory', 'system', 'temp'].includes(db.name)) return;

    const dbNamespace: SQLNamespace = {};

    db.schemas.forEach((schema) => {
      const schemaNamespace: SQLNamespace = {};

      if (SYSTEM_DUCKDB_SCHEMAS.includes(schema.name)) return;

      schema.objects.forEach((table) => {
        const columns = table.columns.map((col) => createColumnCompletion(col));

        schemaNamespace[table.name] = {
          self: createTableOrViewCompletion(table),
          children: columns,
        };
      });

      dbNamespace[schema.name] = {
        self: createSchemaCompletion(schema, db.name),
        children: schemaNamespace,
      };
    });

    namespace[db.name] = {
      self: createDatabaseCompletion(db, 99),
      children: dbNamespace,
    };
  });

  return namespace;
};
