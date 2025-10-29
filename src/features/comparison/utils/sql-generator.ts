import { ComparisonConfig, ComparisonSource, SchemaComparisonResult } from '@models/tab';
import { quote } from '@utils/helpers';
import { validateFilterExpression } from '@utils/sql-security';

/**
 * Builds the source SQL for a comparison source
 */
export const buildSourceSQL = (source: ComparisonSource): string => {
  if (source.type === 'table') {
    const parts = [];
    if (source.databaseName) {
      parts.push(quote(source.databaseName));
    }
    parts.push(quote(source.schemaName || 'main'));
    parts.push(quote(source.tableName));
    return parts.join('.');
  }
  return `(${source.sql})`;
};

/**
 * Generates the comparison SQL query
 */
export const generateComparisonSQL = (
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
): string => {
  const { sourceA, sourceB, joinColumns, compareColumns, showOnlyDifferences } = config;

  // Validate that both sources are selected
  if (!sourceA || !sourceB) {
    throw new Error('Both sourceA and sourceB must be selected to generate comparison SQL');
  }

  // Handle filter mode
  const filterA = config.filterMode === 'common' ? config.commonFilter : config.filterA;
  const filterB = config.filterMode === 'common' ? config.commonFilter : config.filterB;

  // Determine which columns to compare
  const columnsToCompare = compareColumns || schemaComparison.commonColumns.map((c) => c.name);

  // Build CTEs for filtered sources
  const sourceASQL = buildSourceSQL(sourceA);
  const sourceBSQL = buildSourceSQL(sourceB);

  let sql = 'WITH\n';

  // Source A CTE
  sql += '  source_a_filtered AS (\n';
  sql += `    SELECT * FROM ${sourceASQL}\n`;
  if (filterA) {
    sql += `    WHERE ${filterA}\n`;
  }
  sql += '  ),\n';

  // Source B CTE
  sql += '  source_b_filtered AS (\n';
  sql += `    SELECT * FROM ${sourceBSQL}\n`;
  if (filterB) {
    sql += `    WHERE ${filterB}\n`;
  }
  sql += '  ),\n';

  // Comparison CTE
  sql += '  comparison AS (\n';
  sql += '    SELECT\n';

  // Add join key columns with COALESCE
  const keySelects = joinColumns.map(
    (key) => `      COALESCE(a.${quote(key)}, b.${quote(key)}) as ${quote(`_key_${key}`)}`,
  );
  sql += `${keySelects.join(',\n')},\n`;

  // Add compared column pairs and status columns
  const columnSelects: string[] = [];
  const statusConditions: string[] = [];

  columnsToCompare.forEach((colName) => {
    const quotedCol = quote(colName);
    columnSelects.push(`      a.${quotedCol} as ${quote(`${colName}_a`)}`);
    columnSelects.push(`      b.${quotedCol} as ${quote(`${colName}_b`)}`);

    // Status column for this field
    columnSelects.push(`      CASE
        WHEN a.${quote(joinColumns[0])} IS NULL THEN 'added'
        WHEN b.${quote(joinColumns[0])} IS NULL THEN 'removed'
        WHEN a.${quotedCol} IS DISTINCT FROM b.${quotedCol} THEN 'modified'
        ELSE 'same'
      END as ${quote(`${colName}_status`)}`);

    // Add to status conditions for overall row status
    statusConditions.push(`a.${quotedCol} IS DISTINCT FROM b.${quotedCol}`);
  });

  sql += `${columnSelects.join(',\n')},\n`;

  // Overall row status
  sql += '      CASE\n';
  sql += `        WHEN a.${quote(joinColumns[0])} IS NULL THEN 'added'\n`;
  sql += `        WHEN b.${quote(joinColumns[0])} IS NULL THEN 'removed'\n`;
  if (statusConditions.length > 0) {
    sql += `        WHEN ${statusConditions.join(' OR ')} THEN 'modified'\n`;
  }
  sql += "        ELSE 'same'\n";
  sql += '      END as _row_status\n';

  // FROM clause with FULL OUTER JOIN
  sql += '    FROM source_a_filtered a\n';
  sql += '    FULL OUTER JOIN source_b_filtered b\n';

  // ON clause using all join columns
  const joinConditions = joinColumns.map((key) => `a.${quote(key)} = b.${quote(key)}`);
  sql += `      ON ${joinConditions.join(' AND ')}\n`;
  sql += '  )\n';

  // Final SELECT
  sql += 'SELECT * FROM comparison\n';

  // Optional: filter to only show differences
  if (showOnlyDifferences) {
    sql += "WHERE _row_status != 'same'\n";
  }

  // Order by join keys
  const orderByKeys = joinColumns.map((key) => quote(`_key_${key}`));
  sql += `ORDER BY ${orderByKeys.join(', ')};`;

  return sql;
};

/**
 * Validates the comparison configuration
 */
export const validateComparisonConfig = (
  config: ComparisonConfig,
  schemaComparison?: SchemaComparisonResult,
): string | null => {
  if (config.joinColumns.length === 0) {
    return 'At least one join key must be selected';
  }

  // compareColumns can be null (meaning "all columns") or an array
  // Only fail if it's explicitly an empty array
  if (config.compareColumns !== null && config.compareColumns.length === 0) {
    return 'At least one column must be selected for comparison';
  }

  // Validate join columns exist in schema (if schema provided)
  if (schemaComparison) {
    const commonColumnNames = schemaComparison.commonColumns.map((c) => c.name);
    for (const joinCol of config.joinColumns) {
      if (!commonColumnNames.includes(joinCol)) {
        return `Join column "${joinCol}" not found in both schemas`;
      }
    }

    // Validate compare columns exist in schema (if explicitly set)
    if (config.compareColumns !== null) {
      for (const compareCol of config.compareColumns) {
        if (!commonColumnNames.includes(compareCol)) {
          return `Compare column "${compareCol}" not found in both schemas`;
        }
      }
    }
  }

  // Validate filter expressions for potentially dangerous patterns
  const filterA = config.filterMode === 'common' ? config.commonFilter : config.filterA;
  const filterB = config.filterMode === 'common' ? config.commonFilter : config.filterB;

  if (filterA && !validateFilterExpression(filterA)) {
    return 'Filter A contains potentially dangerous SQL patterns. Please use simple filter expressions without SQL keywords like DROP, DELETE, UNION, etc.';
  }

  if (filterB && !validateFilterExpression(filterB)) {
    return 'Filter B contains potentially dangerous SQL patterns. Please use simple filter expressions without SQL keywords like DROP, DELETE, UNION, etc.';
  }

  return null;
};
