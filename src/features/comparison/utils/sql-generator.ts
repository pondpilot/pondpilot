import { ComparisonConfig, ComparisonSource, SchemaComparisonResult } from '@models/tab';
import { quote } from '@utils/helpers';
import { validateFilterExpression } from '@utils/sql-security';

import { MAX_HASH_MODULUS, MAX_HASH_RANGE_SIZE } from '../config/execution-config';

export type HashFilterOptions =
  | {
      type: 'hash-bucket';
      modulus: number;
      bucket: number;
    }
  | {
      type: 'hash-range';
      start: string;
      end: string;
    };

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
  const { joinColumns, joinKeyMappings, columnMappings, excludedColumns = [] } = config;
  const excludedSet = new Set(excludedColumns);

  // Get join key B columns (mapped or same name)
  const joinKeyBColumns = joinColumns.map((keyA) => joinKeyMappings[keyA] || keyA);

  // Build lists of columns from Source A (excluding join keys)
  const allColumnsA = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInA.map((c) => c.name),
  ].filter((col) => !joinColumns.includes(col));

  const candidateColumnsA = allColumnsA.filter((col) => !excludedSet.has(col));

  // Build lists of columns from Source B (excluding join keys)
  const allColumnsB = [
    ...schemaComparison.commonColumns.map((c) => c.name),
    ...schemaComparison.onlyInB.map((c) => c.name),
  ].filter((col) => !joinKeyBColumns.includes(col));

  // Determine which columns to compare: only columns that have a mapping (auto or custom)
  return candidateColumnsA.filter((colA) => {
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

export const buildHashFilterCondition = (
  source: 'a' | 'b',
  joinColumns: string[],
  joinKeyMappings: Record<string, string>,
  filter: HashFilterOptions | undefined,
): string | null => {
  if (!filter) {
    return null;
  }

  const columns =
    source === 'a' ? joinColumns : joinColumns.map((key) => joinKeyMappings[key] || key);

  if (columns.length === 0) {
    return null;
  }

  const structPack = `struct_pack(${columns
    .map((col) => `${quote(col)} := ${quote(col)}`)
    .join(', ')})`;

  if (filter.type === 'hash-bucket') {
    if (!Number.isInteger(filter.modulus) || filter.modulus <= 0) {
      throw new Error(`Invalid bucket modulus: ${filter.modulus}. Must be a positive integer.`);
    }
    if (filter.modulus > MAX_HASH_MODULUS) {
      throw new Error(
        `Bucket modulus ${filter.modulus} exceeds maximum allowed value of ${MAX_HASH_MODULUS}. Please use a smaller modulus to prevent excessive resource usage.`,
      );
    }
    if (!Number.isInteger(filter.bucket) || filter.bucket < 0 || filter.bucket >= filter.modulus) {
      throw new Error(
        `Invalid bucket number: ${filter.bucket}. Must be a non-negative integer less than modulus (${filter.modulus}).`,
      );
    }

    const normalizedModulo = `((hash(${structPack}) % ${filter.modulus}) + ${filter.modulus}) % ${filter.modulus}`;
    return `${normalizedModulo} = ${filter.bucket}`;
  }

  let start: bigint;
  let end: bigint;

  try {
    start = BigInt(filter.start);
  } catch (err) {
    throw new Error(
      `Invalid hash range start value: "${filter.start}". Must be a valid integer string.`,
    );
  }

  try {
    end = BigInt(filter.end);
  } catch (err) {
    throw new Error(
      `Invalid hash range end value: "${filter.end}". Must be a valid integer string.`,
    );
  }

  if (start < 0n) {
    throw new Error('Invalid hash range start. Start must be non-negative.');
  }

  if (end <= start) {
    throw new Error('Invalid hash range. End must be greater than start.');
  }

  const rangeSize = end - start;
  if (rangeSize > MAX_HASH_RANGE_SIZE) {
    throw new Error(
      `Hash range size (${rangeSize.toString()}) exceeds maximum allowed size of ${MAX_HASH_RANGE_SIZE.toString()}. Please use a smaller range to prevent excessive resource usage.`,
    );
  }

  const startLiteral = `${start.toString()}::UBIGINT`;
  const endLiteral = `${(end - 1n).toString()}::UBIGINT`;
  return `hash(${structPack}) BETWEEN ${startLiteral} AND ${endLiteral}`;
};

/**
 * Generates the comparison SQL query
 */
export const generateComparisonSQL = (
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
  options?: {
    materialize?: boolean;
    tableName?: string;
    hashFilter?: HashFilterOptions;
    includeOrderBy?: boolean;
  },
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
  const bucketConditionA = buildHashFilterCondition(
    'a',
    joinColumns,
    joinKeyMappings,
    options?.hashFilter,
  );
  const sourceAConditions: string[] = [];
  if (filterA) {
    sourceAConditions.push(filterA);
  }
  if (bucketConditionA) {
    sourceAConditions.push(bucketConditionA);
  }
  sql += '  source_a_filtered AS (\n';
  sql += `    SELECT * FROM ${sourceASQL}\n`;
  if (sourceAConditions.length > 0) {
    sql += `    WHERE ${sourceAConditions.join(' AND ')}\n`;
  }
  sql += '  ),\n';

  // Source B CTE
  const bucketConditionB = buildHashFilterCondition(
    'b',
    joinColumns,
    joinKeyMappings,
    options?.hashFilter,
  );
  const sourceBConditions: string[] = [];
  if (filterB) {
    sourceBConditions.push(filterB);
  }
  if (bucketConditionB) {
    sourceBConditions.push(bucketConditionB);
  }
  sql += '  source_b_filtered AS (\n';
  sql += `    SELECT * FROM ${sourceBSQL}\n`;
  if (sourceBConditions.length > 0) {
    sql += `    WHERE ${sourceBConditions.join(' AND ')}\n`;
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

  if (options?.includeOrderBy !== false) {
    // Order by join keys
    const orderByKeys = joinColumns.map((key) => quote(`_key_${key}`));
    sql += `ORDER BY ${orderByKeys.join(', ')};`;
  } else {
    sql += ';';
  }

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
