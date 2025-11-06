import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ComparisonConfig, ComparisonSource, SchemaComparisonResult } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

import {
  buildHashFilterCondition,
  buildSourceSQL,
  generateComparisonSQL,
  HashFilterOptions,
} from '../../utils/sql-generator';
import { HashDiffMetrics } from '../types';
import { PriorityQueue } from './priority-queue';

const ABORT_ERROR_NAME = 'AbortError';

type HashSegment = {
  modulus: number;
  bucket: number;
  depth: number;
};

type QueueEntry = HashSegment & {
  countA: number;
  countB: number;
  estimatedSize: number;
  countsComputed: boolean;
};

export type RangeHashDiffProgressStage =
  | 'queued'
  | 'counting'
  | 'splitting'
  | 'inserting'
  | 'bucket-complete'
  | 'finalizing'
  | 'done';

export type RangeHashDiffProgressUpdate = {
  stage: RangeHashDiffProgressStage;
  segment: HashSegment | null;
  completedBuckets: number;
  pendingBuckets: number;
  totalBuckets: number;
  processedRows: number;
  countA?: number;
  countB?: number;
  diffRows?: number;
};

export type RangeHashDiffOptions = {
  rowThreshold?: number;
  splitFactor?: number;
  maxDepth?: number;
};

type RangeHashDiffContext = {
  signal?: AbortSignal;
  onProgress?: (update: RangeHashDiffProgressUpdate) => void;
};

const DEFAULT_OPTIONS: Required<RangeHashDiffOptions> = {
  rowThreshold: 100_000,
  splitFactor: 4,
  maxDepth: 6,
};

const MAX_ADAPTIVE_DEPTH = 10;

const createAbortError = () => new DOMException('Comparison execution aborted', ABORT_ERROR_NAME);

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const runQuery = async (pool: AsyncDuckDBConnectionPool, sql: string, signal?: AbortSignal) => {
  if (!signal) {
    return pool.query(sql);
  }

  const result = await pool.queryAbortable(sql, signal);
  if (result.aborted) {
    throw createAbortError();
  }

  return result.value;
};

const stripTrailingSemicolon = (sql: string): string => sql.replace(/;\s*$/, '');

const getFilterForSource = (config: ComparisonConfig, source: 'a' | 'b'): string | null => {
  if (config.filterMode === 'common') {
    return config.commonFilter ?? null;
  }

  return source === 'a' ? (config.filterA ?? null) : (config.filterB ?? null);
};

const buildFilteredSourceSelect = (
  source: ComparisonSource,
  sourceKind: 'a' | 'b',
  config: ComparisonConfig,
  hashFilter: HashFilterOptions | undefined,
): string => {
  const base = buildSourceSQL(source);
  const userFilter = getFilterForSource(config, sourceKind);
  const hashCondition = buildHashFilterCondition(
    sourceKind,
    config.joinColumns,
    config.joinKeyMappings,
    hashFilter,
  );

  const conditions: string[] = [];
  if (userFilter) {
    conditions.push(userFilter);
  }
  if (hashCondition) {
    conditions.push(hashCondition);
  }

  let sql = `SELECT * FROM ${base}`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  return sql;
};

const createEmptyResultsTable = async (
  pool: AsyncDuckDBConnectionPool,
  tableName: string,
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
  signal?: AbortSignal,
) => {
  const qualified = `pondpilot.main.${toDuckDBIdentifier(tableName)}`;
  const baseSelect = generateComparisonSQL(config, schemaComparison, { includeOrderBy: true });
  const selectWithoutSemicolon = baseSelect.trim().replace(/;$/, '');
  const createSql = `CREATE OR REPLACE TABLE ${qualified} AS\n${selectWithoutSemicolon} LIMIT 0;`;
  await runQuery(pool, createSql, signal);
};

const buildHashExpression = (sourceKind: 'a' | 'b', config: ComparisonConfig): string => {
  const { joinColumns, joinKeyMappings } = config;
  const columns =
    sourceKind === 'a' ? joinColumns : joinColumns.map((key) => joinKeyMappings[key] || key);

  const structPack = columns.map((col) => `${quote(col)} := ${quote(col)}`).join(', ');

  return `hash(struct_pack(${structPack}))`;
};

const computeFinalModulus = (splitFactor: number, maxDepth: number): number =>
  splitFactor ** maxDepth;

type BucketCounts = {
  modulus: number;
  counts: Float64Array;
};

const computeBucketCounts = async (
  pool: AsyncDuckDBConnectionPool,
  source: ComparisonSource,
  sourceKind: 'a' | 'b',
  config: ComparisonConfig,
  modulus: number,
  signal?: AbortSignal,
): Promise<BucketCounts> => {
  const filteredSource = stripTrailingSemicolon(
    buildFilteredSourceSelect(source, sourceKind, config, undefined).trim(),
  );
  const hashExpression = buildHashExpression(sourceKind, config);
  const bucketExpr = `(((${hashExpression}) % ${modulus}) + ${modulus}) % ${modulus}`;
  const sql = `SELECT ${bucketExpr} AS bucket, COUNT(*) AS cnt FROM (${filteredSource}) AS filtered GROUP BY 1`;

  const result = await runQuery(pool, sql, signal);
  const bucketsColumn = result.getChild('bucket');
  const countsColumn = result.getChild('cnt');

  const counts = new Float64Array(modulus);
  if (bucketsColumn && countsColumn) {
    for (let i = 0; i < result.numRows; i += 1) {
      const bucketValue = bucketsColumn.get(i);
      const countValue = countsColumn.get(i);
      if (bucketValue === null || bucketValue === undefined) {
        continue;
      }
      const numericBucket =
        typeof bucketValue === 'bigint' ? Number(bucketValue) : Number(bucketValue);
      if (!Number.isFinite(numericBucket)) {
        continue;
      }
      const idx = Math.trunc(numericBucket);
      if (idx >= 0 && idx < modulus) {
        const numericCount =
          countValue === null || countValue === undefined
            ? 0
            : typeof countValue === 'bigint'
              ? Number(countValue)
              : Number(countValue);
        counts[idx] = numericCount;
      }
    }
  }

  return { modulus, counts };
};

const sumCountsForSegment = (segment: HashSegment, counts: BucketCounts): number => {
  const { modulus, bucket } = segment;
  let total = 0;
  for (let idx = bucket; idx < counts.modulus; idx += modulus) {
    total += counts.counts[idx];
  }
  return total;
};

const makeBucketFilter = (segment: HashSegment): HashFilterOptions => ({
  type: 'hash-bucket',
  modulus: segment.modulus,
  bucket: segment.bucket,
});

const countTotalRows = async (
  pool: AsyncDuckDBConnectionPool,
  source: ComparisonSource,
  sourceKind: 'a' | 'b',
  config: ComparisonConfig,
  signal?: AbortSignal,
): Promise<number> => {
  const sourceSql = buildFilteredSourceSelect(source, sourceKind, config, undefined);
  const sql = `SELECT COUNT(*) AS cnt FROM (${sourceSql}) AS source_total`;
  const result = await runQuery(pool, sql, signal);
  const countColumn = result.getChild('cnt') ?? result.getChildAt(0);
  const countValue = countColumn?.get(0);
  return typeof countValue === 'number' ? countValue : Number(countValue ?? 0);
};

export const determineEffectiveDepth = (
  maxRows: number,
  options: Required<RangeHashDiffOptions>,
): number => {
  const factor = Math.max(2, options.splitFactor);

  if (maxRows <= options.rowThreshold) {
    return 0;
  }

  const requiredDepth = Math.ceil(Math.log(maxRows / options.rowThreshold) / Math.log(factor));

  const boundedRequiredDepth = Math.max(0, requiredDepth);
  const cappedByConfig = Math.min(boundedRequiredDepth, options.maxDepth);

  return Math.min(cappedByConfig, MAX_ADAPTIVE_DEPTH);
};

export const calculateSplitFactor = (
  maxCount: number,
  threshold: number,
  baseSplitFactor: number,
): number => {
  if (maxCount <= threshold) {
    return 0;
  }

  const desired = Math.ceil(maxCount / threshold);
  const bounded = Math.min(baseSplitFactor, Math.max(2, desired));
  return bounded;
};

export const runRangeHashDiff = async (
  pool: AsyncDuckDBConnectionPool,
  tableName: string,
  config: ComparisonConfig,
  schemaComparison: SchemaComparisonResult,
  options?: RangeHashDiffOptions,
  context?: RangeHashDiffContext,
): Promise<HashDiffMetrics> => {
  if (!config.sourceA || !config.sourceB) {
    throw new Error('Both sourceA and sourceB must be provided for comparison execution.');
  }

  const signal = context?.signal;
  const executorOptions = { ...DEFAULT_OPTIONS, ...options };
  const splitFactor = Math.max(2, executorOptions.splitFactor);

  const [totalA, totalB] = await Promise.all([
    countTotalRows(pool, config.sourceA, 'a', config, signal),
    countTotalRows(pool, config.sourceB, 'b', config, signal),
  ]);

  const maxRows = Math.max(totalA, totalB);
  const effectiveDepth = determineEffectiveDepth(maxRows, executorOptions);
  const finalModulus = computeFinalModulus(splitFactor, effectiveDepth);

  await createEmptyResultsTable(pool, tableName, config, schemaComparison, signal);

  const [countsA, countsB] = await Promise.all([
    computeBucketCounts(pool, config.sourceA, 'a', config, finalModulus, signal),
    computeBucketCounts(pool, config.sourceB, 'b', config, finalModulus, signal),
  ]);

  const rootSegment: QueueEntry = {
    modulus: 1,
    bucket: 0,
    depth: 0,
    countA: totalA,
    countB: totalB,
    estimatedSize: 0,
    countsComputed: true,
  };
  rootSegment.estimatedSize = Math.max(rootSegment.countA, rootSegment.countB);

  const getEffectiveSize = (entry: QueueEntry): number =>
    entry.countsComputed ? Math.max(entry.countA, entry.countB) : entry.estimatedSize;

  const queue = new PriorityQueue<QueueEntry>((a, b) => {
    const sizeA = getEffectiveSize(a);
    const sizeB = getEffectiveSize(b);
    if (sizeA !== sizeB) {
      return sizeA > sizeB;
    }
    return a.depth < b.depth;
  });

  if (!(rootSegment.countA === 0 && rootSegment.countB === 0)) {
    queue.push(rootSegment);
  }

  let pendingBuckets = queue.size();
  let completedBuckets = 0;
  let processedRows = 0;
  let diffRows = 0;
  let totalBucketsEnqueued = queue.size();
  let maxDepthProcessed = rootSegment.depth;
  let maxBucketRowsA = rootSegment.countA;
  let maxBucketRowsB = rootSegment.countB;

  const sendProgress = (
    stage: RangeHashDiffProgressStage,
    segment: HashSegment | null,
    extra?: { countA?: number; countB?: number; diffRows?: number },
    includeCurrent: boolean = stage === 'counting' || stage === 'inserting',
  ) => {
    if (!context?.onProgress) {
      return;
    }
    const totalBuckets = Math.max(completedBuckets + pendingBuckets + (includeCurrent ? 1 : 0), 1);
    context.onProgress({
      stage,
      segment,
      completedBuckets,
      pendingBuckets,
      totalBuckets,
      processedRows,
      countA: extra?.countA,
      countB: extra?.countB,
      diffRows: extra?.diffRows,
    });
  };

  sendProgress('queued', null, undefined, false);

  const computeCountsForEntry = (entry: QueueEntry): void => {
    if (entry.countsComputed) {
      return;
    }
    const segment: HashSegment = {
      modulus: entry.modulus,
      bucket: entry.bucket,
      depth: entry.depth,
    };
    entry.countA = sumCountsForSegment(segment, countsA);
    entry.countB = sumCountsForSegment(segment, countsB);
    entry.countsComputed = true;
    entry.estimatedSize = Math.max(entry.countA, entry.countB);
  };

  const pickNextSegment = (): QueueEntry | null => {
    const entry = queue.pop();
    if (!entry) {
      return null;
    }
    computeCountsForEntry(entry);
    return entry;
  };

  const performInsertForSegment = async (
    segment: HashSegment,
    countA: number,
    countB: number,
  ): Promise<number> => {
    const bucketFilter = makeBucketFilter(segment);

    const rawSelect = generateComparisonSQL(config, schemaComparison, {
      includeOrderBy: false,
      hashFilter: bucketFilter,
    });
    const trimmedSelect = stripTrailingSemicolon(rawSelect.trim());

    const countSql = `SELECT COUNT(*) AS cnt FROM (${trimmedSelect}) AS bucket_rows`;
    const countResult = await runQuery(pool, countSql, signal);
    const countColumn = countResult.getChild('cnt') ?? countResult.getChildAt(0);
    const countValue = countColumn?.get(0);
    const insertedCount = typeof countValue === 'number' ? countValue : Number(countValue ?? 0);

    const insertSql = `INSERT INTO pondpilot.main.${toDuckDBIdentifier(tableName)}\n${trimmedSelect};`;
    await runQuery(pool, insertSql, signal);

    processedRows += Math.max(countA, countB);
    return insertedCount;
  };

  while (true) {
    throwIfAborted(signal);
    const current = pickNextSegment();
    if (!current) {
      break;
    }
    pendingBuckets = Math.max(pendingBuckets - 1, 0);
    const { modulus, bucket, depth, countA, countB } = current;
    const maxCount = Math.max(countA, countB);
    const segment: HashSegment = { modulus, bucket, depth };
    maxDepthProcessed = Math.max(maxDepthProcessed, depth);
    maxBucketRowsA = Math.max(maxBucketRowsA, countA);
    maxBucketRowsB = Math.max(maxBucketRowsB, countB);

    sendProgress('counting', segment, { countA, countB, diffRows }, true);

    if (maxCount === 0) {
      completedBuckets += 1;
      sendProgress('bucket-complete', segment, { countA, countB, diffRows }, false);
      continue;
    }

    if (maxCount <= executorOptions.rowThreshold) {
      sendProgress('inserting', segment, { countA, countB }, true);
      const insertedCount = await performInsertForSegment(segment, countA, countB);
      diffRows += insertedCount;
      completedBuckets += 1;
      sendProgress('bucket-complete', segment, { countA, countB, diffRows }, false);
      continue;
    }

    const canSplitFurther = depth < effectiveDepth && modulus < finalModulus;
    const shouldSplit = canSplitFurther && maxCount > executorOptions.rowThreshold;

    if (!shouldSplit) {
      sendProgress('inserting', segment, { countA, countB }, true);
      const insertedCount = await performInsertForSegment(segment, countA, countB);
      diffRows += insertedCount;
      completedBuckets += 1;
      sendProgress('bucket-complete', segment, { countA, countB, diffRows }, false);
      continue;
    }

    let localSplitFactor = calculateSplitFactor(
      maxCount,
      executorOptions.rowThreshold,
      splitFactor,
    );

    if (localSplitFactor <= 1) {
      localSplitFactor = Math.min(splitFactor, Math.max(2, splitFactor));
    }

    const nextModulus = modulus * localSplitFactor;
    const estimatedChildSize = Math.max(1, Math.ceil(maxCount / localSplitFactor));

    for (let i = 0; i < localSplitFactor; i += 1) {
      const childBucket = bucket + i * modulus;
      queue.push({
        modulus: nextModulus,
        bucket: childBucket,
        depth: depth + 1,
        countA: -1,
        countB: -1,
        estimatedSize: estimatedChildSize,
        countsComputed: false,
      });
    }

    pendingBuckets += localSplitFactor;
    totalBucketsEnqueued += localSplitFactor;
    sendProgress('splitting', segment, { countA, countB, diffRows }, false);
  }

  throwIfAborted(signal);
  sendProgress('finalizing', null, { diffRows }, false);
  await runQuery(pool, 'CHECKPOINT;', signal);
  sendProgress('done', null, { diffRows }, false);

  return {
    processedBuckets: completedBuckets,
    totalBucketsEnqueued,
    maxDepth: maxDepthProcessed,
    maxBucketRowsA,
    maxBucketRowsB,
  };
};
