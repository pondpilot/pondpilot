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
 * Gets the Source B column name for a given Source A column, considering mappings
 */
const getMappedColumnB = (colA: string, columnMappings: Record<string, string>): string => {
  return columnMappings[colA] || colA;
};

/**
 * Gets the list of columns to compare based on mappings (auto + custom)
 */
export const getColumnsToCompare = (
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
): string[] => {
  const { joinColumns, joinKeyMappings, columnMappings } = config;

  // Get join key B columns (mapped or same name)
  const joinKeyBColumns = joinColumns.map((keyA) => joinKeyMappings[keyA] || keyA);

  // Build lists of columns from Source A (excluding join keys)
  const allColumnsA = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInA.map((c) => c.name),
  ].filter((col) => !joinColumns.includes(col));

  // Build lists of columns from Source B (excluding join keys)
  const allColumnsB = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInB.map((c) => c.name),
  ].filter((col) => !joinKeyBColumns.includes(col));

  // Determine which columns to compare: only columns that have a mapping (auto or custom)
  return allColumnsA.filter((colA) => {
    // Has custom mapping
    if (columnMappings[colA]) {
      return true;
    }
    // Has auto mapping (same name exists in B)
    if (allColumnsB.includes(colA)) {
      return true;
    }
    return false;
  });
};

/**
 * Generates the comparison SQL query
 */
export const generateComparisonSQL = (
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
  options?: { materialize?: boolean; tableName?: string },
): string => {
  const { sourceA, sourceB, joinColumns, joinKeyMappings, showOnlyDifferences, columnMappings } =
    config;

  // Validate that both sources are selected
  if (!sourceA || !sourceB) {
    throw new Error('Both sourceA and sourceB must be selected to generate comparison SQL');
  }

  // Handle filter mode
  const filterA = config.filterMode === 'common' ? config.commonFilter : config.filterA;
  const filterB = config.filterMode === 'common' ? config.commonFilter : config.filterB;

  // Get columns to compare based on mappings (auto + custom)
  const columnsToCompare = getColumnsToCompare(config, schemaComparison);

  // Build CTEs for filtered sources
  const sourceASQL = buildSourceSQL(sourceA);
  const sourceBSQL = buildSourceSQL(sourceB);

  let sql = '';

  // If materializing, add CREATE TABLE AS prefix
  // We create regular tables (not TEMP) in the system database so they persist across browser restarts
  if (options?.materialize && options?.tableName) {
    sql += `CREATE OR REPLACE TABLE pondpilot.main.${quote(options.tableName)} AS\n`;
  }

  sql += 'WITH\n';

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
  const keySelects = joinColumns.map((key) => {
    const mappedKeyB = getMappedColumnB(key, joinKeyMappings);
    return `      COALESCE(a.${quote(key)}, b.${quote(mappedKeyB)}) as ${quote(`_key_${key}`)}`;
  });
  sql += keySelects.join(',\n');

  // Add compared column pairs and status columns
  const columnSelects: string[] = [];
  const statusConditions: string[] = [];

  columnsToCompare.forEach((colName) => {
    const quotedColA = quote(colName);
    const mappedColB = getMappedColumnB(colName, columnMappings);
    const quotedColB = quote(mappedColB);

    columnSelects.push(`      a.${quotedColA} as ${quote(`${colName}_a`)}`);
    columnSelects.push(`      b.${quotedColB} as ${quote(`${colName}_b`)}`);

    // Status column for this field
    const firstJoinKey = joinColumns[0];
    const mappedFirstJoinKey = getMappedColumnB(firstJoinKey, joinKeyMappings);

    columnSelects.push(`      CASE
        WHEN a.${quote(firstJoinKey)} IS NULL THEN 'added'
        WHEN b.${quote(mappedFirstJoinKey)} IS NULL THEN 'removed'
        WHEN a.${quotedColA} IS DISTINCT FROM b.${quotedColB} THEN 'modified'
        ELSE 'same'
      END as ${quote(`${colName}_status`)}`);

    // Add to status conditions for overall row status
    statusConditions.push(`a.${quotedColA} IS DISTINCT FROM b.${quotedColB}`);
  });

  // Add comma and column selects only if there are columns to compare
  if (columnSelects.length > 0) {
    sql += ',\n';
    sql += `${columnSelects.join(',\n')},\n`;
  } else {
    sql += ',\n';
  }

  // Overall row status
  const firstJoinKey = joinColumns[0];
  const mappedFirstJoinKey = getMappedColumnB(firstJoinKey, joinKeyMappings);

  sql += '      CASE\n';
  sql += `        WHEN a.${quote(firstJoinKey)} IS NULL THEN 'added'\n`;
  sql += `        WHEN b.${quote(mappedFirstJoinKey)} IS NULL THEN 'removed'\n`;
  if (statusConditions.length > 0) {
    sql += `        WHEN ${statusConditions.join(' OR ')} THEN 'modified'\n`;
  }
  sql += "        ELSE 'same'\n";
  sql += '      END as _row_status\n';

  // FROM clause with FULL OUTER JOIN
  sql += '    FROM source_a_filtered a\n';
  sql += '    FULL OUTER JOIN source_b_filtered b\n';

  // ON clause using all join columns (with mappings)
  const joinConditions = joinColumns.map((key) => {
    const mappedKeyB = getMappedColumnB(key, joinKeyMappings);
    return `a.${quote(key)} = b.${quote(mappedKeyB)}`;
  });
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
  _schemaComparison?: SchemaComparisonResult,
): string | null => {
  if (config.joinColumns.length === 0) {
    return 'At least one join key must be selected';
  }

  // Note: We no longer validate compareColumns since comparison columns
  // are now determined by mappings (auto + custom)

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
