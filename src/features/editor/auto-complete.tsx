/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */

import { DataBaseModel } from '@models/common';
import type { SQLNamespace } from '@codemirror/lang-sql';
import type { Completion } from '@codemirror/autocomplete';

/**
 * Converts a column type to a more generic SQL type for autocompletion
 */
const getSQLType = (type: string): string => {
  const typeLower = type.toLowerCase();
  if (
    typeLower.includes('int') ||
    typeLower.includes('decimal') ||
    typeLower.includes('numeric') ||
    typeLower.includes('float') ||
    typeLower.includes('double')
  ) {
    return 'number';
  }
  if (typeLower.includes('char') || typeLower.includes('text') || typeLower.includes('string')) {
    return 'text';
  }
  if (typeLower.includes('date') || typeLower.includes('time')) {
    return 'datetime';
  }
  if (typeLower.includes('bool')) {
    return 'boolean';
  }
  return 'other';
};

/**
 * Creates a completion item for a database object
 */
const createCompletion = (
  label: string,
  type: string,
  displayLabel?: string,
  boost?: number,
): Completion => ({
  label: label.includes(' ') ? `"${label}"` : label,
  displayLabel,
  type,
  boost: boost || 1,
});

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

export const SYSTEM_DUCKDB_SHEMAS = [
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
];

export const createDuckDBCompletions = (
  functionDocs: Record<string, { syntax: string; description: string }>,
): SQLNamespace =>
  Object.entries(functionDocs).reduce((acc: any, [name]) => {
    if (postgresDialectFunctions.has(name)) {
      return acc;
    }
    acc[name] = {
      self: createCompletion(name, 'function', name, 2),
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
      mainSchema.tables.forEach((table) => {
        // Skip system tables
        if (
          !table.name.startsWith('duckdb_') &&
          !table.name.startsWith('sqlite_') &&
          !table.name.startsWith('pragma_')
        ) {
          const columns = table.columns.map((col) =>
            createCompletion(col.name, 'variable', `${col.name} (${getSQLType(col.type)})`, 99),
          );

          namespace[table.name] = {
            self: createCompletion(table.name, 'table', table.name, 95),
            children: columns,
          };

          topTableNames.push(table.name);
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

      if (SYSTEM_DUCKDB_SHEMAS.includes(schema.name)) return;

      schema.tables.forEach((table) => {
        const columns = table.columns.map((col) =>
          createCompletion(col.name, 'column', `${col.name} (${getSQLType(col.type)})`),
        );

        schemaNamespace[table.name] = {
          self: createCompletion(table.name, 'table', `${schema.name}.${table.name}`),
          children: columns,
        };
      });

      dbNamespace[schema.name] = {
        self: createCompletion(schema.name, 'schema', `${db.name}.${schema.name}`),
        children: schemaNamespace,
      };
    });

    namespace[db.name] = {
      self: createCompletion(db.name, 'database', db.name, 99),
      children: dbNamespace,
    };
  });

  return namespace;
};
