import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonId } from '@models/comparison';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';

/**
 * Context object passed to all comparison algorithms
 */
export interface AlgorithmContext {
  pool: AsyncDuckDBConnectionPool;
  comparisonId: ComparisonId;
  config: ComparisonConfig;
  schemaComparison: SchemaComparisonResult;
  tableName: string;
  abortSignal: AbortSignal;
}

/**
 * Progress callback for algorithms that support progress tracking
 */
export type AlgorithmProgressCallback = (update: AlgorithmProgressUpdate) => void;

/**
 * Progress update from an algorithm
 */
export interface AlgorithmProgressUpdate {
  stage: string;
  completedBuckets?: number;
  pendingBuckets?: number;
  totalBuckets?: number;
  processedRows?: number;
  diffRows?: number;
  currentBucket?: {
    depth: number;
    countA: number;
    countB: number;
    modulus?: number;
    bucket?: number;
    hashRangeStart?: string;
    hashRangeEnd?: string;
  };
}

/**
 * Result of algorithm execution
 */
export interface AlgorithmExecutionResult {
  /**
   * SQL query that was executed (for algorithms that use SQL generation)
   */
  generatedSQL?: string;

  /**
   * Whether this algorithm used sampling
   */
  usedSampling?: boolean;

  /**
   * Sampling parameters if applicable
   */
  samplingParams?: {
    sampleSize: number;
    totalRows: number;
    samplingRate: number;
  };
}

/**
 * Common interface for all comparison algorithms
 */
export interface ComparisonAlgorithm {
  /**
   * Unique identifier for this algorithm
   */
  readonly name: 'hash-bucket' | 'join' | 'sampling';

  /**
   * Human-readable display name
   */
  readonly displayName: string;

  /**
   * Whether this algorithm supports progress tracking
   */
  readonly supportsProgress: boolean;

  /**
   * Whether this algorithm can be cancelled mid-execution
   */
  readonly supportsCancellation: boolean;

  /**
   * Whether this algorithm supports finishing early with partial results
   */
  readonly supportsFinishEarly: boolean;

  /**
   * Determines if this algorithm can handle the given context
   */
  canHandle: (context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>) => boolean;

  /**
   * Estimates a cost score for running this algorithm on the given context.
   * Lower scores are preferred. Used for auto-selection.
   */
  estimateCost: (context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>) => number;

  /**
   * Executes the comparison algorithm
   */
  execute: (
    context: AlgorithmContext,
    onProgress?: AlgorithmProgressCallback,
  ) => Promise<AlgorithmExecutionResult>;
}

/**
 * Algorithm selection mode
 */
export type AlgorithmSelectionMode = 'auto' | 'hash-bucket' | 'join' | 'sampling';
