import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonSource, SchemaComparisonResult } from '@models/tab';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';
import { useState, useCallback } from 'react';

import { detectJoinKeys } from '../utils/key-detection';

type ColumnInfo = {
  name: string;
  type: string;
};

/**
 * Gets schema for a source (table or query)
 */
const getSourceSchema = async (
  pool: AsyncDuckDBConnectionPool,
  source: ComparisonSource,
): Promise<ColumnInfo[]> => {
  let sql: string;

  if (source.type === 'table') {
    const schemaName = source.schemaName || 'main';
    const { databaseName } = source;

    // Build fully qualified table name
    const tableParts = [];
    if (databaseName) {
      tableParts.push(quote(databaseName));
    }
    tableParts.push(quote(schemaName));
    tableParts.push(quote(source.tableName));

    sql = `DESCRIBE (SELECT * FROM ${tableParts.join('.')} LIMIT 0)`;
  } else {
    sql = `DESCRIBE (SELECT * FROM (${source.sql}) LIMIT 0)`;
  }

  const result = await pool.query<{
    column_name: arrow.Utf8;
    column_type: arrow.Utf8;
  }>(sql);

  const columnNames = result.getChild('column_name');
  const columnTypes = result.getChild('column_type');

  if (!columnNames || !columnTypes) {
    return [];
  }

  const columns: ColumnInfo[] = [];
  for (let i = 0; i < result.numRows; i += 1) {
    const name = columnNames.get(i);
    const type = columnTypes.get(i);
    if (name && type) {
      columns.push({ name, type });
    }
  }

  return columns;
};

/**
 * Hook to analyze and compare schemas of two data sources
 */
export const useSchemaAnalysis = (pool: AsyncDuckDBConnectionPool) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeSchemas = useCallback(
    async (
      sourceA: ComparisonSource,
      sourceB: ComparisonSource,
    ): Promise<SchemaComparisonResult | null> => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const [schemaA, schemaB] = await Promise.all([
          getSourceSchema(pool, sourceA),
          getSourceSchema(pool, sourceB),
        ]);

        const schemaAMap = new Map(schemaA.map((col) => [col.name, col.type]));
        const schemaBMap = new Map(schemaB.map((col) => [col.name, col.type]));

        const commonColumns: SchemaComparisonResult['commonColumns'] = [];
        const onlyInA: SchemaComparisonResult['onlyInA'] = [];
        const onlyInB: SchemaComparisonResult['onlyInB'] = [];

        // Find common columns and columns only in A
        schemaA.forEach((colA) => {
          const typeB = schemaBMap.get(colA.name);
          if (typeB !== undefined) {
            commonColumns.push({
              name: colA.name,
              typeA: colA.type,
              typeB,
              typesMatch: colA.type === typeB,
            });
          } else {
            onlyInA.push({
              name: colA.name,
              type: colA.type,
            });
          }
        });

        // Find columns only in B
        schemaB.forEach((colB) => {
          if (!schemaAMap.has(colB.name)) {
            onlyInB.push({
              name: colB.name,
              type: colB.type,
            });
          }
        });

        // Detect suggested join keys
        const suggestedKeys = await detectJoinKeys(
          pool,
          sourceA,
          sourceB,
          commonColumns.map((c) => c.name),
        );

        const result = {
          commonColumns,
          onlyInA,
          onlyInB,
          suggestedKeys,
        };
        console.log('[DEBUG] Schema analysis completed:', result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Schema analysis failed:', err);
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [pool],
  );

  return { analyzeSchemas, isAnalyzing, error };
};
