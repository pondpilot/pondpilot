import { NewId } from './new-id';

export type ComparisonId = NewId<'ComparisonId'>;

// Data source for comparison
export type ComparisonSource =
  | { type: 'table'; tableName: string; schemaName?: string; databaseName?: string }
  | { type: 'query'; sql: string; alias: string };

/**
 * Comparison configuration for dataset comparison operations.
 *
 * SECURITY WARNING: All user-provided string values in this configuration
 * (filterA, filterB, commonFilter, joinColumns, and sql in ComparisonSource) must be
 * properly sanitized before being used in SQL query construction.
 *
 * @important When executing comparisons:
 * - NEVER concatenate filterA/filterB/commonFilter directly into SQL queries
 * - ALWAYS use parameterized queries or validate against safe subsets
 * - ALWAYS validate joinColumns exist in schemaComparison before use
 * - ALWAYS properly quote/escape column identifiers from joinColumns
 * - For compareMode 'coerce', ensure safe type coercion operations
 */
export interface ComparisonConfig {
  sourceA: ComparisonSource | null;
  sourceB: ComparisonSource | null;

  /**
   * User-specified join columns from Source A (REQUIRED before execution).
   * These are the Source A column names used as join keys.
   * SECURITY: Always properly quote/escape as SQL identifiers.
   */
  joinColumns: string[];

  /**
   * Join key mappings from Source A to Source B.
   * Maps Source A join key names to Source B join key names when they differ.
   * Format: { sourceAJoinKey: sourceBJoinKey }
   *
   * Example: { "user_id": "id", "created_at": "creation_time" }
   *
   * Auto-detected when columns have matching names. Must be explicitly set
   * when join key names differ between sources.
   */
  joinKeyMappings: Record<string, string>;

  /**
   * Custom column mappings from Source A to Source B for comparison columns.
   * Maps Source A column names to Source B column names when they differ.
   * Format: { sourceAColumn: sourceBColumn }
   *
   * Example: { "email": "email_address", "created_at": "creation_date" }
   *
   * This allows comparing columns with different names across sources.
   * Columns not in this map are assumed to have the same name in both sources.
   * Note: Join key columns are handled separately via joinKeyMappings.
   */
  columnMappings: Record<string, string>;

  /**
   * Columns from Source A to exclude from comparison.
   * These identifiers are evaluated after join keys are removed. Any mapped columns
   * represented here should be skipped when generating comparison SQL.
   */
  excludedColumns: string[];

  /**
   * Filter mode: 'common' applies same filter to both sources, 'separate' uses filterA/filterB
   */
  filterMode: 'common' | 'separate';

  /**
   * Common WHERE clause filter applied to both sources (user-provided SQL expression).
   * SECURITY CRITICAL: This is a raw SQL fragment that must be validated/sanitized.
   * Only used when filterMode is 'common'.
   */
  commonFilter: string | null;

  /**
   * Optional WHERE clause filters for each source (user-provided SQL expressions).
   * SECURITY CRITICAL: These are raw SQL fragments that must be validated/sanitized.
   * Consider restricting to safe subsets or using a query builder with parameters.
   * Used when filterMode is 'separate'. Values are preserved even when filterMode is 'common'
   * to avoid data loss when switching modes.
   */
  filterA: string | null;
  filterB: string | null;

  // Result filtering (affects SQL query for performance)
  // Default: true (recommended for large datasets)
  showOnlyDifferences: boolean;

  // Comparison mode
  compareMode: 'strict' | 'coerce'; // strict = exact match, coerce = type conversion

  /**
   * Comparison algorithm to use. 'auto' will defer to heuristics,
   * 'hash-bucket' uses the memory-efficient hash diff executor,
   * 'join' runs the classic full outer join query,
   * 'sampling' performs comparison on a random sample.
   */
  algorithm: 'auto' | 'hash-bucket' | 'join' | 'sampling';
}

export type ComparisonAlgorithmName = Exclude<ComparisonConfig['algorithm'], 'auto'>;

export interface SchemaComparisonResult {
  // Columns that exist in both tables
  commonColumns: Array<{
    name: string;
    typeA: string;
    typeB: string;
    typesMatch: boolean;
  }>;

  // Columns only in source A
  onlyInA: Array<{
    name: string;
    type: string;
  }>;

  // Columns only in source B
  onlyInB: Array<{
    name: string;
    type: string;
  }>;

  // Suggested join key columns (based on PK detection, 'id' columns, etc.)
  suggestedKeys: string[];

  // Optional row counts derived from metadata or fast queries
  rowCountA: number | null;
  rowCountB: number | null;
  rowCountSourceA: 'metadata' | 'query' | null;
  rowCountSourceB: 'metadata' | 'query' | null;
}

export type Comparison = {
  id: ComparisonId;

  /**
   * The name of the comparison.
   */
  name: string;

  // Configuration state
  config: ComparisonConfig | null; // null = not configured yet

  // Schema analysis (cached after first analysis)
  schemaComparison: SchemaComparisonResult | null;

  // Last execution duration in seconds (used for display and refresh detection)
  lastExecutionTime: number | null;

  // ISO timestamp of last successful run
  lastRunAt: string | null;

  // Materialized comparison results table name in the system database
  // Format: __pondpilot_comparison_{sanitized_comparison_id}
  // This persists across browser restarts unlike temp tables
  resultsTableName: string | null;

  metadata: {
    sourceStats: ComparisonSourceStats | null;
    partialResults: boolean;
    executionMetadata: ComparisonExecutionMetadata | null;
  };
};

export type RowCountSource = 'metadata' | 'query';

export interface ComparisonExecutionMetadata {
  /**
   * Algorithm that was used for this execution
   */
  algorithmUsed: ComparisonAlgorithmName;

  /**
   * Sampling parameters if sampling was used
   */
  samplingParams?: {
    sampleSize: number;
    totalRows: number;
    samplingRate: number;
  };

  hashDiffMetrics?: {
    processedBuckets: number;
    totalBucketsEnqueued: number;
    maxDepth: number;
    maxBucketRowsA: number;
    maxBucketRowsB: number;
  };
}

export interface ComparisonSourceStats {
  sourceA: ComparisonSourceStat | null;
  sourceB: ComparisonSourceStat | null;
}

export interface ComparisonSourceStat {
  rowCount: number;
  rowCountSource: RowCountSource;
  lastUpdated: string; // ISO timestamp
}

export type ComparisonExecutionStage =
  | 'idle'
  | 'queued'
  | 'counting'
  | 'splitting'
  | 'inserting'
  | 'bucket-complete'
  | 'finalizing'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'failed';

export const COMPARISON_EXECUTION_STAGE = {
  IDLE: 'idle' as const,
  QUEUED: 'queued' as const,
  COUNTING: 'counting' as const,
  SPLITTING: 'splitting' as const,
  INSERTING: 'inserting' as const,
  BUCKET_COMPLETE: 'bucket-complete' as const,
  FINALIZING: 'finalizing' as const,
  COMPLETED: 'completed' as const,
  PARTIAL: 'partial' as const,
  CANCELLED: 'cancelled' as const,
  FAILED: 'failed' as const,
} satisfies Record<string, ComparisonExecutionStage>;

export interface ComparisonExecutionBucket {
  depth: number;
  countA: number;
  countB: number;
  modulus?: number;
  bucket?: number;
  hashRangeStart?: string;
  hashRangeEnd?: string;
}

export interface ComparisonExecutionProgress {
  stage: ComparisonExecutionStage;
  startedAt: number;
  updatedAt: number;
  completedBuckets: number;
  pendingBuckets: number;
  totalBuckets: number;
  processedRows: number;
  diffRows: number;
  currentBucket: ComparisonExecutionBucket | null;
  cancelRequested: boolean;
  supportsFinishEarly: boolean;
  error?: string;
}
