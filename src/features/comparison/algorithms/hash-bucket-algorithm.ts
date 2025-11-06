import { SchemaComparisonResult } from '@models/tab';

import {
  RangeHashDiffOptions,
  RangeHashDiffProgressUpdate,
  runRangeHashDiff,
} from './range-hashdiff/executor';
import {
  AlgorithmContext,
  AlgorithmExecutionResult,
  AlgorithmProgressCallback,
  ComparisonAlgorithm,
} from './types';

/**
 * Hash-bucket comparison algorithm
 *
 * Memory-efficient algorithm that splits large datasets into hash buckets
 * and compares them incrementally. Supports progress tracking, cancellation,
 * and finishing early with partial results.
 *
 * Best for: Large datasets (>1M rows) or wide tables
 */
export class HashBucketAlgorithm implements ComparisonAlgorithm {
  readonly name = 'hash-bucket' as const;
  readonly displayName = 'Hash Diff (Memory Efficient)';
  readonly supportsProgress = true;
  readonly supportsCancellation = true;
  readonly supportsFinishEarly = true;

  canHandle(_context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): boolean {
    // Hash-bucket can handle any dataset
    return true;
  }

  estimateCost(context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): number {
    const { schemaComparison } = context;

    const counts = [schemaComparison.rowCountA, schemaComparison.rowCountB].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (counts.length === 0) {
      return 120; // Prefer other algorithms when dataset size is unknown
    }

    const maxRowCount = Math.max(...counts);
    const totalColumns =
      schemaComparison.commonColumns.length +
      schemaComparison.onlyInA.length +
      schemaComparison.onlyInB.length;

    const estimatedMemoryFactor = maxRowCount * totalColumns;

    // Lower cost for large datasets or wide tables
    if (maxRowCount > 1_000_000 || estimatedMemoryFactor > 50_000_000) {
      return 10; // Low cost - ideal for large data
    }

    if (maxRowCount > 500_000) {
      return 30; // Medium-low cost
    }

    return 100; // High cost for small datasets (join is better)
  }

  async execute(
    context: AlgorithmContext,
    onProgress?: AlgorithmProgressCallback,
  ): Promise<AlgorithmExecutionResult> {
    const { pool, config, schemaComparison, tableName, abortSignal } = context;

    const hashDiffOptions = this.computeHashDiffOptions(schemaComparison);

    // Convert internal progress updates to our common format
    const progressHandler = onProgress
      ? (update: RangeHashDiffProgressUpdate) => {
          onProgress({
            stage: update.stage,
            completedBuckets: update.completedBuckets,
            pendingBuckets: update.pendingBuckets,
            totalBuckets: update.totalBuckets,
            processedRows: update.processedRows,
            diffRows: update.diffRows,
            currentBucket: update.segment
              ? {
                  modulus: update.segment.modulus,
                  bucket: update.segment.bucket,
                  depth: update.segment.depth,
                  countA: update.countA ?? 0,
                  countB: update.countB ?? 0,
                }
              : undefined,
          });
        }
      : undefined;

    await runRangeHashDiff(pool, tableName, config, schemaComparison, hashDiffOptions, {
      signal: abortSignal,
      onProgress: progressHandler,
    });

    return {};
  }

  private computeHashDiffOptions(
    schemaComparison: SchemaComparisonResult,
  ): RangeHashDiffOptions | undefined {
    const counts = [schemaComparison.rowCountA, schemaComparison.rowCountB].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (counts.length === 0) {
      return undefined;
    }

    const MIN_BUCKET_ROW_THRESHOLD = 100_000;
    const MAX_BUCKET_ROW_THRESHOLD = 4_000_000;
    const TARGET_BUCKETS_PER_SIDE = 4;
    const MAX_TOTAL_BUCKETS = 1_000;

    const maxRows = Math.max(...counts);
    const desiredThreshold = Math.ceil(maxRows / TARGET_BUCKETS_PER_SIDE);
    const rowThreshold = Math.max(
      MIN_BUCKET_ROW_THRESHOLD,
      Math.min(MAX_BUCKET_ROW_THRESHOLD, desiredThreshold),
    );

    // Estimate the maximum number of buckets that could be created
    const estimatedMaxBuckets = Math.ceil(maxRows / MIN_BUCKET_ROW_THRESHOLD);

    // Enforce resource limit to prevent excessive bucket creation
    if (estimatedMaxBuckets > MAX_TOTAL_BUCKETS) {
      console.warn(
        `Estimated bucket count (${estimatedMaxBuckets}) exceeds safety limit (${MAX_TOTAL_BUCKETS}). ` +
          'Adjusting row threshold to stay within limits.',
      );
      const adjustedThreshold = Math.ceil(maxRows / MAX_TOTAL_BUCKETS);
      return { rowThreshold: Math.max(adjustedThreshold, MIN_BUCKET_ROW_THRESHOLD) };
    }

    return { rowThreshold };
  }
}
