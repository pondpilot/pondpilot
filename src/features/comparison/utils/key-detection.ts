import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonSource } from '@models/tab';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';

/**
 * Gets primary key columns for a table source
 */
const getPrimaryKeysForTable = async (
  pool: AsyncDuckDBConnectionPool,
  databaseName: string | undefined,
  schemaName: string,
  tableName: string,
): Promise<string[]> => {
  try {
    const whereConditions = [
      "dc.constraint_type = 'PRIMARY KEY'",
      `cols.schema_name = ${quote(schemaName, { single: true })}`,
      `cols.table_name = ${quote(tableName, { single: true })}`,
    ];

    if (databaseName) {
      whereConditions.push(`cols.database_name = ${quote(databaseName, { single: true })}`);
    }

    const sql = `
      SELECT column_name
      FROM duckdb_constraints dc
      JOIN duckdb_columns cols ON dc.table_oid = cols.table_oid
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY cols.column_index
    `;

    const result = await pool.query<{ column_name: arrow.Utf8 }>(sql);
    const columnNames = result.getChild('column_name');

    if (!columnNames) {
      return [];
    }

    const keys: string[] = [];
    for (let i = 0; i < result.numRows; i += 1) {
      const name = columnNames.get(i);
      if (name) {
        keys.push(name);
      }
    }

    return keys;
  } catch (err) {
    console.error('Failed to get primary keys:', err);
    return [];
  }
};

/**
 * Detects and suggests join key columns for comparison
 */
export const detectJoinKeys = async (
  pool: AsyncDuckDBConnectionPool,
  sourceA: ComparisonSource,
  sourceB: ComparisonSource,
  commonColumnNames: string[],
): Promise<string[]> => {
  // If both sources are tables, try to get their primary keys
  if (sourceA.type === 'table' && sourceB.type === 'table') {
    const schemaA = sourceA.schemaName || 'main';
    const schemaB = sourceB.schemaName || 'main';

    const [pksA, pksB] = await Promise.all([
      getPrimaryKeysForTable(pool, sourceA.databaseName, schemaA, sourceA.tableName),
      getPrimaryKeysForTable(pool, sourceB.databaseName, schemaB, sourceB.tableName),
    ]);

    // If both have PKs, find common PK columns
    if (pksA.length > 0 && pksB.length > 0) {
      const commonPKs = pksA.filter((pk) => pksB.includes(pk));
      if (commonPKs.length > 0) {
        return commonPKs;
      }
    }
  }

  // Look for common columns that are likely to be keys
  const likelyKeyColumns = commonColumnNames.filter((name) => {
    const lowerName = name.toLowerCase();
    return (
      lowerName === 'id' ||
      lowerName.endsWith('_id') ||
      lowerName.startsWith('id_') ||
      lowerName === 'key' ||
      lowerName.endsWith('_key')
    );
  });

  if (likelyKeyColumns.length > 0) {
    return likelyKeyColumns;
  }

  // No obvious keys found - return empty array
  // User will need to manually select
  return [];
};
