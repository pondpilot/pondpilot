import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';

import {
  AlgorithmContext,
  AlgorithmExecutionResult,
  AlgorithmProgressCallback,
  ComparisonAlgorithm,
} from './types';
import { generateComparisonSQL, buildSourceSQL } from '../utils/sql-generator';

/**
 * Sampling-based comparison algorithm
 *
 * Smart sampling with staged execution:
 *
 * Stage 1 - Sample and Extract Keys (Smart Materialization):
 * - Randomly samples 1% of rows from source A (min 1k, max 100k)
 * - Materializes ONLY the join keys (very small table)
 * - This keeps memory usage minimal while enabling efficient lookup
 *
 * Stage 2 - Query and Compare (Streaming):
 * - Uses materialized keys to query matching rows from both sources
 * - All intermediate results (sampled rows, matched rows) are streamed via CTEs
 * - Only final comparison result is materialized
 *
 * This ensures we compare MATCHING records (not random non-overlapping samples)
 * while minimizing memory usage through smart materialization strategy.
 *
 * IMPORTANT: This is a PREVIEW ONLY mode. Results show:
 * - ✓ Differences in sampled rows (accurate for the sample)
 * - ✓ Modified/removed records that exist in sample
 * - ✗ Added records (not sampled from A, so can't find them)
 * - ✗ Complete coverage (only a percentage of rows checked)
 *
 * For full comparisons on large datasets, use 'hash-bucket' algorithm instead.
 *
 * Best for: Quick exploratory previews to see types of differences
 */
export class SamplingAlgorithm implements ComparisonAlgorithm {
  readonly name = 'sampling' as const;
  readonly displayName = 'Random Sampling (Preview)';
  readonly supportsProgress = true;
  readonly supportsCancellation = true;
  readonly supportsFinishEarly = true;

  // Sampling configuration (conservative for browser memory)
  // Sampling is for quick previews only - use hash-bucket for full comparisons
  private readonly SAMPLE_PERCENTAGE = 0.01; // Sample 1% of rows
  private readonly MIN_SAMPLE_SIZE = 1_000; // Minimum sample size (even for small datasets)
  private readonly MAX_SAMPLE_SIZE = 100_000; // Maximum sample size (hard cap for browser memory)
  private readonly DEFAULT_SAMPLE_SIZE = 100_000; // Fallback when row count unavailable - use max for best preview

  canHandle(_context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): boolean {
    // Sampling can handle any dataset
    return true;
  }

  estimateCost(_context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>): number {
    // Sampling is only ideal when explicitly requested
    // It should never be auto-selected over other algorithms
    // So we return a high cost to discourage auto-selection
    return 1000;
  }

  async execute(
    context: AlgorithmContext,
    onProgress?: AlgorithmProgressCallback,
  ): Promise<AlgorithmExecutionResult> {
    const { pool, config, schemaComparison, tableName, abortSignal } = context;

    const sampleParams = this.calculateSampleSize(schemaComparison);

    // Temporary table name for sampled join keys
    const keysTableName = `${tableName}_sampled_keys`;

    try {
      // Stage 1: Sample from source A and materialize only the join keys
      // This is a small table (1% of rows, capped at 100k, only key columns) to minimize memory usage
      if (onProgress) {
        onProgress({
          stage: 'Sampling source A and extracting join keys',
          processedRows: 0,
          totalBuckets: 2,
          completedBuckets: 0,
          pendingBuckets: 2,
        });
      }

      if (abortSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const stage1SQL = this.generateSampleKeysSQL(config, keysTableName, sampleParams.sampleSize);

      await pool.query(stage1SQL);

      if (onProgress) {
        onProgress({
          stage: 'Querying source B and comparing matched records',
          processedRows: sampleParams.sampleSize,
          totalBuckets: 2,
          completedBuckets: 1,
          pendingBuckets: 1,
        });
      }

      if (abortSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Stage 2: Use the sampled keys to query B and run comparison
      // This stage streams all intermediate results - no materialization except final table
      const stage2SQL = this.generateComparisonSQL(
        config,
        schemaComparison,
        tableName,
        keysTableName,
        sampleParams.sampleSize,
      );

      await pool.query(stage2SQL);

      if (onProgress) {
        onProgress({
          stage: 'completed',
          processedRows: sampleParams.sampleSize,
          totalBuckets: 2,
          completedBuckets: 2,
          pendingBuckets: 0,
        });
      }

      return {
        generatedSQL: `${stage1SQL}\n\n${stage2SQL}`,
        usedSampling: true,
        samplingParams: sampleParams,
      };
    } finally {
      // Cleanup: Drop the temporary keys table
      try {
        await pool.query(`DROP TABLE IF EXISTS ${keysTableName}`);
      } catch (err) {
        console.warn('Failed to cleanup temporary keys table:', err);
      }
    }
  }

  private calculateSampleSize(schemaComparison: SchemaComparisonResult): {
    sampleSize: number;
    totalRows: number;
    samplingRate: number;
  } {
    // Use row counts from metadata when available (schemaComparison already has this from schema analysis)
    const counts = [schemaComparison.rowCountA, schemaComparison.rowCountB].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    // If row counts unavailable, use default
    if (counts.length === 0) {
      return {
        sampleSize: this.DEFAULT_SAMPLE_SIZE,
        totalRows: this.DEFAULT_SAMPLE_SIZE,
        samplingRate: 1,
      };
    }

    const totalRows = Math.max(...counts);

    // Calculate percentage-based sample size
    const percentageBasedSize = Math.floor(totalRows * this.SAMPLE_PERCENTAGE);

    // Apply hard limits: at least MIN_SAMPLE_SIZE, at most MAX_SAMPLE_SIZE
    const sampleSize = Math.min(
      this.MAX_SAMPLE_SIZE,
      Math.max(this.MIN_SAMPLE_SIZE, percentageBasedSize),
    );

    const samplingRate = totalRows > 0 ? sampleSize / totalRows : 1;

    return { sampleSize, totalRows, samplingRate };
  }

  /**
   * Stage 1: Sample from source A and materialize only the join keys
   *
   * Smart materialization: We only materialize the join keys (very small table),
   * not the full sampled rows. This minimizes memory usage while allowing
   * efficient lookup in source B.
   */
  private generateSampleKeysSQL(
    config: ComparisonConfig,
    keysTableName: string,
    rowLimit: number,
  ): string {
    const { sourceA, filterMode, commonFilter, filterA, joinColumns } = config;

    if (!sourceA) {
      throw new Error('sourceA is required for sampling');
    }

    if (joinColumns.length === 0) {
      throw new Error('Join columns are required for sampling comparison');
    }

    const sourceARef = buildSourceSQL(sourceA);
    const filterAClause = (filterMode === 'common' ? commonFilter : filterA) || null;
    const joinKeysA = joinColumns.map((col) => `"${col}"`).join(', ');

    return `
      CREATE OR REPLACE TABLE ${keysTableName} AS
      SELECT DISTINCT ${joinKeysA}
      FROM (
        SELECT ${joinKeysA}
        FROM ${sourceARef}
        ${filterAClause ? `WHERE ${filterAClause}` : ''}
        ORDER BY random()
        LIMIT ${rowLimit}
      )
    `.trim();
  }

  /**
   * Stage 2: Use sampled keys to query B and run comparison
   *
   * Smart materialization: Uses the small materialized keys table from stage 1
   * to query matching rows from both sources. All other intermediate results
   * (sampled_a, matched_b, comparison) are streamed via CTEs - not materialized.
   * Only the final comparison result is materialized into the output table.
   */
  private generateComparisonSQL(
    config: ComparisonConfig,
    schemaComparison: SchemaComparisonResult,
    tableName: string,
    keysTableName: string,
    rowLimit: number,
  ): string {
    const {
      sourceA,
      sourceB,
      filterMode,
      commonFilter,
      filterA,
      filterB,
      joinColumns,
      joinKeyMappings,
    } = config;

    if (!sourceA || !sourceB) {
      throw new Error('Both sourceA and sourceB are required for comparison');
    }

    const sourceARef = buildSourceSQL(sourceA, { includeDefaultAlias: false });
    const sourceBRef = buildSourceSQL(sourceB, { includeDefaultAlias: false });

    const filterAClause = (filterMode === 'common' ? commonFilter : filterA) || null;
    const filterBClause = (filterMode === 'common' ? commonFilter : filterB) || null;

    // Build join conditions for matching keys from the materialized keys table
    const joinConditionA = joinColumns
      .map((col) => {
        return `a."${col}" = keys."${col}"`;
      })
      .join(' AND ');

    const joinConditionB = joinColumns
      .map((colA) => {
        const colB = joinKeyMappings[colA] || colA;
        return `b."${colB}" = keys."${colA}"`;
      })
      .join(' AND ');

    // Use the standard comparison SQL generator with wrapped sources
    // We wrap our sampled sources as query sources
    const wrappedConfig: ComparisonConfig = {
      ...config,
      sourceA: {
        type: 'query',
        sql: `
          SELECT a.*
          FROM ${sourceARef} a
          INNER JOIN ${keysTableName} keys ON ${joinConditionA}
          ${filterAClause ? `WHERE ${filterAClause}` : ''}
        `,
        alias: 'sampled_a',
      },
      sourceB: {
        type: 'query',
        sql: `
          SELECT b.*
          FROM ${sourceBRef} b
          INNER JOIN ${keysTableName} keys ON ${joinConditionB}
          ${filterBClause ? `WHERE ${filterBClause}` : ''}
        `,
        alias: 'matched_b',
      },
      // Clear filters since they're already applied in the query sources
      filterMode: 'separate',
      filterA: null,
      filterB: null,
      commonFilter: null,
    };

    // Generate the comparison SQL with materialization
    // This will create the final result table with all differences
    return generateComparisonSQL(wrappedConfig, schemaComparison, {
      materialize: true,
      tableName,
    });
  }

}
