import {
  AlgorithmContext,
  AlgorithmExecutionResult,
  AlgorithmProgressCallback,
  ComparisonAlgorithm,
} from './types';
import { generateComparisonSQL } from '../utils/sql-generator';

/**
 * Join-based comparison algorithm
 *
 * Traditional full outer join approach. Simpler and faster for small to medium datasets,
 * but can consume significant memory for large datasets.
 *
 * Best for: Small to medium datasets (<1M rows) with moderate column counts
 */
export class JoinAlgorithm implements ComparisonAlgorithm {
  readonly name = 'join' as const;
  readonly displayName = 'Full Outer Join';
  readonly supportsProgress = false;
  readonly supportsCancellation = false;
  readonly supportsFinishEarly = false;

  canHandle(_context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): boolean {
    // Join can handle any dataset (though may be inefficient for large ones)
    return true;
  }

  estimateCost(context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): number {
    const { schemaComparison } = context;

    const counts = [schemaComparison.rowCountA, schemaComparison.rowCountB].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (counts.length === 0) {
      return 50; // Medium cost when row count unknown
    }

    const maxRowCount = Math.max(...counts);
    const totalColumns =
      schemaComparison.commonColumns.length +
      schemaComparison.onlyInA.length +
      schemaComparison.onlyInB.length;

    const estimatedMemoryFactor = maxRowCount * totalColumns;

    // Lower cost for small datasets
    if (maxRowCount <= 500_000) {
      return 1; // Very low cost - ideal for small data
    }

    if (maxRowCount <= 1_000_000 && estimatedMemoryFactor <= 50_000_000) {
      return 20; // Low-medium cost for medium data
    }

    return 100; // High cost for large datasets (hash-bucket is better)
  }

  async execute(
    context: AlgorithmContext,
    _onProgress?: AlgorithmProgressCallback,
  ): Promise<AlgorithmExecutionResult> {
    const { pool, config, schemaComparison, tableName } = context;

    const sql = generateComparisonSQL(config, schemaComparison, {
      materialize: true,
      tableName,
    });

    await pool.query(sql);

    return { generatedSQL: sql };
  }
}
