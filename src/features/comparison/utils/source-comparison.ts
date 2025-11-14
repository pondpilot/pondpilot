import { ComparisonSource } from '@models/tab';

/**
 * Normalizes a table source for comparison by converting all names to lowercase.
 */
export const normalizeTableSource = (source: ComparisonSource & { type: 'table' }) => ({
  database: (source.databaseName || '').toLowerCase(),
  schema: (source.schemaName || '').toLowerCase(),
  table: source.tableName.toLowerCase(),
});

/**
 * Compares two comparison sources for equality, handling normalization.
 */
export const areSourcesEqual = (
  a: ComparisonSource | null,
  b: ComparisonSource | null,
): boolean => {
  if (!a || !b || a.type !== b.type) {
    return false;
  }

  if (a.type === 'table' && b.type === 'table') {
    const na = normalizeTableSource(a);
    const nb = normalizeTableSource(b);
    return na.database === nb.database && na.schema === nb.schema && na.table === nb.table;
  }

  if (a.type === 'query' && b.type === 'query') {
    return a.alias === b.alias && a.sql === b.sql;
  }

  return false;
};

/**
 * Creates a unique key for a pair of comparison sources.
 */
export const createSourceKey = (sourceA: ComparisonSource, sourceB: ComparisonSource): string => {
  const keyA =
    sourceA.type === 'table'
      ? `table:${sourceA.databaseName}:${sourceA.schemaName}:${sourceA.tableName}`
      : `query:${sourceA.alias}`;
  const keyB =
    sourceB.type === 'table'
      ? `table:${sourceB.databaseName}:${sourceB.schemaName}:${sourceB.tableName}`
      : `query:${sourceB.alias}`;
  return `${keyA}|${keyB}`;
};
