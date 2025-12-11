import { DBColumn, NormalizedSQLType } from '@models/db';
import { isNumberType } from '@utils/db';

/**
 * Checks if a column type is suitable for use as a temporal axis (dates/times).
 */
export function isTemporalType(type: NormalizedSQLType): boolean {
  return (
    type === 'date' ||
    type === 'timestamp' ||
    type === 'timestamptz' ||
    type === 'time' ||
    type === 'timetz'
  );
}

/**
 * Checks if a column type is suitable for use as a categorical axis.
 */
export function isCategoricalType(type: NormalizedSQLType): boolean {
  return type === 'string' || type === 'boolean';
}

/**
 * Gets columns suitable for use as X-axis in charts.
 * Prefers: date/timestamp > string > numeric
 */
export function getXAxisCandidates(columns: DBColumn[]): DBColumn[] {
  return columns.filter(
    (col) =>
      isTemporalType(col.sqlType) || isCategoricalType(col.sqlType) || isNumberType(col.sqlType),
  );
}

/**
 * Gets columns suitable for use as Y-axis in charts.
 * Only numeric columns are suitable for Y-axis.
 */
export function getYAxisCandidates(columns: DBColumn[]): DBColumn[] {
  return columns.filter((col) => isNumberType(col.sqlType));
}

/**
 * Gets columns suitable for grouping/series in charts.
 * Prefers: string > boolean
 */
export function getGroupByCandidates(columns: DBColumn[]): DBColumn[] {
  return columns.filter((col) => isCategoricalType(col.sqlType));
}

/**
 * Auto-suggests the best columns for a chart based on column types.
 * Returns suggested column names or null if no suitable column found.
 */
export function suggestChartColumns(columns: DBColumn[]): {
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  groupByColumn: string | null;
} {
  // Find best X-axis column (prefer temporal, then categorical, then numeric)
  const temporalColumns = columns.filter((col) => isTemporalType(col.sqlType));
  const categoricalColumns = columns.filter((col) => isCategoricalType(col.sqlType));
  const numericColumns = columns.filter((col) => isNumberType(col.sqlType));

  let xAxisColumn: string | null = null;
  if (temporalColumns.length > 0) {
    xAxisColumn = temporalColumns[0].name;
  } else if (categoricalColumns.length > 0) {
    xAxisColumn = categoricalColumns[0].name;
  } else if (numericColumns.length > 0) {
    xAxisColumn = numericColumns[0].name;
  }

  // Find best Y-axis column (must be numeric, prefer one that's not the X-axis)
  let yAxisColumn: string | null = null;
  const yAxisCandidates = numericColumns.filter((col) => col.name !== xAxisColumn);
  if (yAxisCandidates.length > 0) {
    yAxisColumn = yAxisCandidates[0].name;
  } else if (numericColumns.length > 0 && numericColumns[0].name !== xAxisColumn) {
    yAxisColumn = numericColumns[0].name;
  } else if (numericColumns.length > 1) {
    yAxisColumn = numericColumns[1].name;
  }

  // Group by column (optional, only suggest if we have extra categorical columns)
  let groupByColumn: string | null = null;
  const groupByCandidates = categoricalColumns.filter((col) => col.name !== xAxisColumn);
  if (groupByCandidates.length > 0) {
    groupByColumn = groupByCandidates[0].name;
  }

  return { xAxisColumn, yAxisColumn, groupByColumn };
}
