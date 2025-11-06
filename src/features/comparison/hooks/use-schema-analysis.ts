import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import type { ComparisonId, ComparisonSourceStat } from '@models/comparison';
import { AnyFlatFileDataSource } from '@models/data-source';
import { DataSourceLocalFile, LocalEntry } from '@models/file-system';
import { ComparisonSource, SchemaComparisonResult } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { setComparisonSourceStats } from '@store/comparison-metadata';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';
import { useState, useCallback } from 'react';

import { buildRowCountCacheKey, getCachedRowCount, setCachedRowCount } from './row-count-cache';
import { detectJoinKeys } from '../utils/key-detection';
import { buildSourceSQL } from '../utils/sql-generator';

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

type RowCountSource = 'metadata' | 'query' | null;

const isFlatFileDataSource = (dataSource: unknown): dataSource is AnyFlatFileDataSource => {
  return Boolean(dataSource) && typeof dataSource === 'object' && 'viewName' in (dataSource as any);
};

const isDataSourceLocalFile = (entry: LocalEntry | undefined): entry is DataSourceLocalFile => {
  return Boolean(entry) && entry?.kind === 'file' && entry?.fileType === 'data-source';
};

const getRowCountFromMetadata = async (
  pool: AsyncDuckDBConnectionPool,
  source: ComparisonSource,
): Promise<{ rowCount: number | null; source: RowCountSource }> => {
  if (source.type !== 'table') {
    return { rowCount: null, source: null };
  }

  if (source.databaseName !== 'pondpilot' || (source.schemaName && source.schemaName !== 'main')) {
    return { rowCount: null, source: null };
  }

  const { dataSources, localEntries } = useAppStore.getState();
  let matchedSource: AnyFlatFileDataSource | null = null;

  for (const value of dataSources.values()) {
    if (isFlatFileDataSource(value) && value.viewName === source.tableName) {
      matchedSource = value;
      break;
    }
  }

  if (!matchedSource || matchedSource.type !== 'parquet') {
    return { rowCount: null, source: null };
  }

  const entry = localEntries.get(matchedSource.fileSourceId);
  if (!isDataSourceLocalFile(entry) || entry.ext !== 'parquet') {
    return { rowCount: null, source: null };
  }

  try {
    const fileLiteral = quote(`${entry.uniqueAlias}.${entry.ext}`, { single: true });
    const result = await pool.query(`SELECT num_rows FROM parquet_file_metadata(${fileLiteral})`);
    const column = result.getChildAt(0);
    const value = column?.get(0);
    if (value === null || value === undefined) {
      return { rowCount: null, source: null };
    }

    const numeric = Number(value);
    if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
      return { rowCount: null, source: null };
    }

    const cacheKey = buildRowCountCacheKey({
      type: 'table',
      databaseName: source.databaseName ?? undefined,
      schemaName: source.schemaName ?? undefined,
      tableName: source.tableName,
    });
    if (cacheKey) {
      setCachedRowCount(cacheKey, numeric);
    }

    return { rowCount: numeric, source: 'metadata' };
  } catch (err) {
    console.warn('Failed to read parquet metadata row count', err);
    return { rowCount: null, source: null };
  }
};

const getRowCountFromQuery = async (
  pool: AsyncDuckDBConnectionPool,
  source: ComparisonSource,
): Promise<{ rowCount: number | null; source: RowCountSource }> => {
  const cacheKey = buildRowCountCacheKey({
    type: source.type,
    databaseName: source.type === 'table' ? source.databaseName : undefined,
    schemaName: source.type === 'table' ? source.schemaName : undefined,
    tableName: source.type === 'table' ? source.tableName : undefined,
    sql: source.type === 'query' ? source.sql : undefined,
  });
  if (!cacheKey) {
    return { rowCount: null, source: null };
  }

  const cached = getCachedRowCount(cacheKey);
  if (cached !== null) {
    return { rowCount: cached, source: 'query' };
  }

  try {
    const base = buildSourceSQL(source);
    const fromClause = source.type === 'query' ? `${base} AS source_row_count` : base;
    const sql = `SELECT COUNT(*) AS cnt FROM ${fromClause}`;
    const result = await pool.query(sql);
    const column = result.getChild('cnt') ?? result.getChildAt(0);
    const value = column?.get(0);
    if (value === null || value === undefined) {
      return { rowCount: null, source: null };
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || Number.isNaN(numeric) || numeric < 0) {
      return { rowCount: null, source: null };
    }

    setCachedRowCount(cacheKey, numeric);
    return { rowCount: numeric, source: 'query' };
  } catch (err) {
    console.warn('Failed to compute row count via query', err);
    return { rowCount: null, source: null };
  }
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
      comparisonId?: ComparisonId | null,
    ): Promise<SchemaComparisonResult | null> => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const [schemaA, schemaB] = await Promise.all([
          getSourceSchema(pool, sourceA),
          getSourceSchema(pool, sourceB),
        ]);

        const [rowCountInfoA, rowCountInfoB] = await Promise.all([
          (async () => {
            const metadata = await getRowCountFromMetadata(pool, sourceA);
            if (metadata.rowCount !== null) {
              return metadata;
            }
            return getRowCountFromQuery(pool, sourceA);
          })(),
          (async () => {
            const metadata = await getRowCountFromMetadata(pool, sourceB);
            if (metadata.rowCount !== null) {
              return metadata;
            }
            return getRowCountFromQuery(pool, sourceB);
          })(),
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
          rowCountA: rowCountInfoA.rowCount,
          rowCountB: rowCountInfoB.rowCount,
          rowCountSourceA: rowCountInfoA.source,
          rowCountSourceB: rowCountInfoB.source,
        };

        if (comparisonId) {
          const now = new Date().toISOString();
          const statsUpdate: {
            sourceA?: ComparisonSourceStat | null;
            sourceB?: ComparisonSourceStat | null;
          } = {};
          if (rowCountInfoA.rowCount !== null && rowCountInfoA.source) {
            statsUpdate.sourceA = {
              rowCount: rowCountInfoA.rowCount,
              rowCountSource: rowCountInfoA.source,
              lastUpdated: now,
            };
          }
          if (rowCountInfoB.rowCount !== null && rowCountInfoB.source) {
            statsUpdate.sourceB = {
              rowCount: rowCountInfoB.rowCount,
              rowCountSource: rowCountInfoB.source,
              lastUpdated: now,
            };
          }
          if (statsUpdate.sourceA || statsUpdate.sourceB) {
            setComparisonSourceStats(comparisonId, statsUpdate);
          }
        }

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
