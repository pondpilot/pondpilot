/**
 * Utilities for optimizing batch processing based on data complexity
 */

import {
  COLUMN_BATCH_SIZE,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE,
  BATCH_SIZE_THRESHOLD_COLUMNS,
  BATCH_SIZE_THRESHOLD_ROWS,
} from '../constants';

/**
 * Calculates optimal batch size based on data characteristics
 *
 * @param columnCount - Total number of columns to process
 * @param rowCount - Number of rows in the dataset
 * @param hasComplexColumns - Whether dataset contains complex column types
 * @returns Optimal batch size for processing
 */
export function calculateOptimalBatchSize(
  columnCount: number,
  rowCount: number,
  hasComplexColumns: boolean = false,
): number {
  let batchSize = COLUMN_BATCH_SIZE;

  // Reduce batch size for large datasets
  if (columnCount > BATCH_SIZE_THRESHOLD_COLUMNS) {
    batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize * 0.5));
  }

  if (rowCount > BATCH_SIZE_THRESHOLD_ROWS) {
    batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize * 0.7));
  }

  // Further reduce for complex column types (JSON, ARRAY, etc.)
  if (hasComplexColumns) {
    batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize * 0.5));
  }

  // Increase batch size for small, simple datasets
  if (columnCount <= 10 && rowCount <= 1000 && !hasComplexColumns) {
    batchSize = Math.min(MAX_BATCH_SIZE, batchSize * 2);
  }

  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, batchSize));
}

/**
 * Determines if dataset contains complex column types that require more processing
 *
 * @param columns - Array of column definitions
 * @returns True if dataset has complex columns that need special handling
 */
export function hasComplexColumnTypes(columns: any[]): boolean {
  const complexTypes = new Set(['JSON', 'ARRAY', 'STRUCT', 'MAP', 'BLOB', 'UNION']);

  return columns.some((column) => {
    const normalizedType = column.type?.toUpperCase() || '';
    return (
      complexTypes.has(normalizedType) ||
      normalizedType.includes('ARRAY') ||
      normalizedType.includes('STRUCT') ||
      normalizedType.includes('JSON')
    );
  });
}

/**
 * Estimates processing complexity score for a dataset
 * Higher scores indicate more complex processing requirements
 *
 * @param columnCount - Number of columns
 * @param rowCount - Number of rows
 * @param hasComplexColumns - Whether complex column types are present
 * @returns Complexity score (0-100)
 */
export function estimateProcessingComplexity(
  columnCount: number,
  rowCount: number,
  hasComplexColumns: boolean,
): number {
  let complexity = 0;

  // Column count contribution (0-30 points)
  complexity += Math.min(30, (columnCount / 100) * 30);

  // Row count contribution (0-40 points)
  complexity += Math.min(40, (rowCount / 10000) * 40);

  // Complex column types contribution (0-30 points)
  if (hasComplexColumns) {
    complexity += 30;
  }

  return Math.min(100, Math.round(complexity));
}

/**
 * Suggests processing strategy based on data characteristics
 *
 * @param columnCount - Number of columns
 * @param rowCount - Number of rows
 * @param hasComplexColumns - Whether complex column types are present
 * @returns Processing strategy recommendation
 */
export function suggestProcessingStrategy(
  columnCount: number,
  rowCount: number,
  hasComplexColumns: boolean,
): {
  batchSize: number;
  useWebWorker: boolean;
  complexity: number;
  strategy: 'simple' | 'batched' | 'optimized' | 'worker';
} {
  const complexity = estimateProcessingComplexity(columnCount, rowCount, hasComplexColumns);
  const batchSize = calculateOptimalBatchSize(columnCount, rowCount, hasComplexColumns);

  let strategy: 'simple' | 'batched' | 'optimized' | 'worker' = 'simple';
  let useWebWorker = false;

  if (complexity < 25) {
    strategy = 'simple';
  } else if (complexity < 50) {
    strategy = 'batched';
  } else if (complexity < 75) {
    strategy = 'optimized';
  } else {
    strategy = 'worker';
    useWebWorker = true;
  }

  return {
    batchSize,
    useWebWorker,
    complexity,
    strategy,
  };
}
