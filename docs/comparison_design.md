# Memory-Efficient Comparison Orchestrator – Implementation Guide

This guide documents the memory-conscious comparison executor now wired into Pondpilot. Treat it as the contract for future maintenance or follow-up iterations.

---

## 1. Context & Goals
- The single-query comparison path materialized a `FULL OUTER JOIN` into `pondpilot.main.<table>`, which exceeded the 3 GB DuckDB-WASM ceiling on large inputs.
- We now stream the diff by partitioning the join space into hash buckets. Each bucket is processed independently, keeping intermediate results bounded while preserving the existing results-table contract for the UI.
- The UI experience (materialized table + viewer hooks) stays intact; only the execution pathway changed.

---

## 2. Architecture Overview

### 2.1 Algorithm Registry Pattern
- Comparison execution now uses a pluggable algorithm architecture via `src/features/comparison/algorithms/registry.ts`.
- Each algorithm implements the `ComparisonAlgorithm` interface with:
  - `canHandle(context)`: Returns whether the algorithm can process the given comparison.
  - `estimateCost(context)`: Returns a numeric cost score (lower is better) for auto-selection.
  - `execute(context, onProgress?)`: Performs the actual comparison.
  - Capability flags: `supportsProgress`, `supportsCancellation`, `supportsFinishEarly`.
- Three algorithms are currently registered:
  1. **HashBucketAlgorithm** (`hash-bucket-algorithm.ts`): Memory-efficient bucketed approach (detailed below).
  2. **JoinAlgorithm** (`join-algorithm.ts`): Traditional full outer join (best for small/medium datasets ≤500k rows).
  3. **SamplingAlgorithm** (`sampling-algorithm.ts`): Comparison on random samples (experimental).
- Auto-selection uses cost-based routing: the registry evaluates all capable algorithms and selects the one with the lowest estimated cost based on row counts and column counts.

### 2.2 Range Hash Executor
- Entry point: `runRangeHashDiff` (`src/features/comparison/algorithms/range-hashdiff/executor.ts`).
- During preparation we compute aggregated hash counts once per source:
  - `SELECT ((hash(struct_pack(join_keys)) % M + M) % M) AS bucket, COUNT(*) FROM (…) GROUP BY 1;` where `M = splitFactor^maxDepth_adjusted`.
  - The executor stores these counts in memory (≤4 k buckets for the default settings), so subsequent segment sizing becomes a simple lookup instead of re-scanning the base tables.
- INSERT statements still hit the original sources with a `hash-bucket` predicate, so only the rows for the current segment are materialised.
- Work unit: `HashSegment { modulus, bucket, depth }` where `bucket` identifies a residue class modulo `modulus`.
- Processing strategy:
  1. Determine an adaptive maximum depth so that the expected bucket size falls at or below the configured row threshold (capped to avoid runaway modulus sizes).
  2. Estimate segment size by summing the pre-computed bucket counts for the current modulus/bucket pair.
  3. If both counts fall below the configured threshold (16 384 rows by default) or the recursion depth hits the cap, stream the diff for that range directly into the results table.
  4. Otherwise split the bucket (`modulus *= splitFactor`, `bucket += i * previousModulus`) and push the children onto a **max-priority queue** so the largest remaining chunks are processed first.
- Every diff statement uses `generateComparisonSQL` with a range predicate and feeds the results table through a single `INSERT … RETURNING` statement to capture the exact number of diff rows inserted without re-running the join.
- **Adaptive bucket sizing**: The `HashBucketAlgorithm` dynamically tunes `rowThreshold` based on dataset size (16 k–4 M rows per bucket), targeting ~4 segments per side while enforcing a safety limit of 1 k total buckets to prevent resource exhaustion.

### 2.3 Hash Predicate
- When range filters are applied inside `generateComparisonSQL` we support both `hash-bucket` (modulus-based) and `hash-range` (BETWEEN-based) predicates.
- `hash-bucket`: Uses `((hash(struct_pack(<join keys>)) % M) + M) % M = bucket` for precise bucket matching.
- `hash-range`: Uses `hash(struct_pack(<join keys>)) BETWEEN <start> AND <end - 1>` for range-based partitioning.
- Additional user filters compose normally with the hash predicate, so DuckDB prunes data before joining.

---

## 2.4 Algorithm Visual Schemes

### Hash Bucket Algorithm (Memory-Efficient)

```
SOURCE A (5M rows)          SOURCE B (5M rows)
     │                           │
     ├─────────────┬─────────────┤
     │             │             │
     ▼             ▼             ▼
┌─────────────────────────────────────┐
│ Pre-compute bucket counts:          │
│ hash(struct_pack(keys)) % M         │
│ M = splitFactor^depth (e.g., 4^3)  │
└─────────────────────────────────────┘
     │
     ├─ counts_a: [120k, 95k, 130k, ...]  (64 buckets)
     └─ counts_b: [125k, 90k, 128k, ...]  (stored in memory)
     │
     ▼
┌─────────────────────────────────────┐
│ Priority Queue (largest first)      │
│ ┌─────────────────────────────────┐ │
│ │ Root: {mod:1, bkt:0, depth:0}   │ │
│ │   countA: 5M, countB: 5M        │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
     │
     ├─ Pop root → too large (>threshold)
     ├─ Split into 4 children:
     │  ├─ {mod:4, bkt:0, depth:1} → countA: 1.25M, countB: 1.23M
     │  ├─ {mod:4, bkt:1, depth:1} → countA: 1.20M, countB: 1.22M
     │  ├─ {mod:4, bkt:2, depth:1} → countA: 1.30M, countB: 1.28M
     │  └─ {mod:4, bkt:3, depth:1} → countA: 1.25M, countB: 1.27M
     │
     ▼
┌─────────────────────────────────────┐
│ Process each bucket when small:     │
│                                     │
│ Bucket {mod:16, bkt:5, depth:2}    │
│ countA: 80k, countB: 75k (<100k)   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ INSERT INTO results_table       │ │
│ │ SELECT ... FROM source_a_filt   │ │
│ │   FULL OUTER JOIN source_b_filt │ │
│ │   WHERE hash(...) % 16 = 5      │ │  ← Only this bucket's data
│ │   AND <user filters>            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
     │
     ├─ Bucket complete → 155k rows processed
     ├─ Continue with next largest bucket
     └─ Repeat until queue empty
     │
     ▼
┌─────────────────────────────────────┐
│ CHECKPOINT; (persist to disk)       │
│                                     │
│ Results table contains all diffs    │
│ Built incrementally, bucket by      │
│ bucket, never holding >100k rows    │
│ in memory from any single INSERT    │
└─────────────────────────────────────┘

Memory footprint per bucket:
  • Bucket counts: O(M) = 64KB for 4096 buckets
  • Active bucket data: ~100k rows (configurable threshold)
  • Total: Bounded regardless of dataset size
```

### Join Algorithm (Traditional)

```
SOURCE A (100k rows)        SOURCE B (100k rows)
     │                           │
     └─────────────┬─────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Single SQL Statement:                               │
│                                                     │
│ CREATE OR REPLACE TABLE results AS                 │
│ WITH                                                │
│   source_a_filtered AS (                           │
│     SELECT * FROM source_a                         │
│     WHERE <user filter A>                          │
│   ),                                               │
│   source_b_filtered AS (                           │
│     SELECT * FROM source_b                         │
│     WHERE <user filter B>                          │
│   ),                                               │
│   comparison AS (                                  │
│     SELECT                                         │
│       COALESCE(a.key, b.key) as _key,             │
│       a.col1 as col1_a,                           │
│       b.col1 as col1_b,                           │
│       CASE ... END as col1_status,                │
│       ...                                          │
│       CASE                                         │
│         WHEN a.key IS NULL THEN 'added'           │
│         WHEN b.key IS NULL THEN 'removed'         │
│         WHEN ... THEN 'modified'                  │
│         ELSE 'same'                               │
│       END as _row_status                          │
│     FROM source_a_filtered a                      │
│     FULL OUTER JOIN source_b_filtered b           │
│       ON a.key1 = b.key1 AND a.key2 = b.key2     │
│   )                                               │
│ SELECT * FROM comparison                          │
│ ORDER BY _key;                                    │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Results table (materialized)                       │
│                                                     │
│ All comparison rows in memory simultaneously       │
│ Fast for small datasets (≤500k rows)               │
│ May exceed 3GB limit for large datasets            │
└─────────────────────────────────────────────────────┘

Memory footprint:
  • Entire result set: O(max(rowsA, rowsB) × columns)
  • No partitioning, no streaming
  • Suitable only when result fits in available memory
```

### Sampling Algorithm (Preview Mode)

```
SOURCE A (5M rows)          SOURCE B (5M rows)
     │                           │
     │                           │
     ▼                           │
┌─────────────────────────────────────┐
│ STAGE 1: Sample & Extract Keys     │
│                                     │
│ CREATE TABLE sampled_keys AS       │
│ SELECT DISTINCT key1, key2, ...    │  ← Only join keys
│ FROM (                             │
│   SELECT key1, key2, ...           │
│   FROM source_a                    │
│   WHERE <filter A>                 │
│   ORDER BY random()                │
│   LIMIT 100,000  (1% of 5M, capped)│
│ )                                  │
└─────────────────────────────────────┘
     │
     │  sampled_keys table:
     │  ~100k rows × key columns only
     │  (minimal memory footprint)
     │
     ├──────────────────┬──────────────┘
     │                  │
     ▼                  ▼
┌─────────────────┐  ┌──────────────────┐
│ Query A:        │  │ Query B:         │
│ SELECT a.*      │  │ SELECT b.*       │
│ FROM source_a a │  │ FROM source_b b  │
│ INNER JOIN      │  │ INNER JOIN       │
│   sampled_keys  │  │   sampled_keys   │
│   ON a.k = k    │  │   ON b.k = k     │
│ WHERE <filter>  │  │ WHERE <filter>   │
└─────────────────┘  └──────────────────┘
     │                  │
     └────────┬─────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 2: Compare Matched Records                   │
│                                                     │
│ CREATE TABLE results AS                            │
│ WITH                                               │
│   sampled_a AS (SELECT ... INNER JOIN keys ...),  │
│   matched_b AS (SELECT ... INNER JOIN keys ...),  │
│   comparison AS (                                  │
│     SELECT ... FULL OUTER JOIN ...                │  ← Standard comparison
│   )                                               │
│ SELECT * FROM comparison;                         │
└─────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Results table (preview only)                       │
│                                                     │
│ ✓ Shows differences in sampled rows                │
│ ✓ Shows modified/removed records in sample         │
│ ✗ Missing added records (not in sample A)          │
│ ✗ Incomplete coverage (~1% of dataset)             │
│                                                     │
│ Use for: Quick exploratory preview                 │
│ Not for: Full comparison coverage                  │
└─────────────────────────────────────────────────────┘

Memory footprint:
  • Sampled keys: ~100k rows × key columns
  • Matched records: ≤100k rows × all columns
  • Result set: ≤100k comparison rows
  • Total: Bounded by sample size, not dataset size

Note: Sampling guarantees matched records are compared
(not random non-overlapping samples from A and B)
```

---

## 3. Execution Flow

1. **Algorithm Selection**
   - `useComparisonExecution` calls `selectAlgorithm(mode, context)` where mode is `'auto' | 'hash-bucket' | 'join' | 'sampling'`.
   - In auto mode, the registry evaluates each algorithm's `estimateCost()` and selects the lowest:
     - JoinAlgorithm: cost = 1 for datasets ≤500k rows, 20 for ≤1M rows, 100 otherwise.
     - HashBucketAlgorithm: cost = 10 for >1M rows or wide tables, 100 for small datasets.
     - SamplingAlgorithm: cost varies based on sampling configuration.
   - Selected algorithm is then executed with full context (pool, config, schemaComparison, tableName, abortSignal).

2. **Preparation (Hash-Bucket Path)**
   - `runRangeHashDiff` validates sources and creates an empty results table via `CREATE OR REPLACE TABLE … AS <select> LIMIT 0;` so schema always matches the viewer contract.
   - Pre-computes bucket counts for both sources at the final modulus depth to enable fast segment size estimation.

3. **Segment Loop (Hash-Bucket Path)**
   - Start with root segment `{ modulus: 1, bucket: 0, depth: 0 }`.
   - For each dequeued segment:
     1. Estimate row counts using pre-computed bucket counts. Zero on both sides → mark complete.
     2. If the segment is small enough (≤ threshold), run a single statement that both inserts the diff rows and counts them (used for progress telemetry).
     3. Otherwise split the range into `splitFactor` children, estimate their size, and push them back on the queue (largest segments processed first).
   - `processedRows` is incremented by the larger of the two side counts each time we materialise a segment, tracking the amount of data scanned.

4. **Completion**
   - After all segments drain, execute `CHECKPOINT;` so the persisted DuckDB database reflects the new table.
   - `useComparisonExecution` continues with its existing bookkeeping: drop the previous results table, update duration, propagate the table name.

---

## 4. SQL Helpers & Struct/Hash Usage

- `generateComparisonSQL` enhancements:
  - Accepts a generic `hashFilter` (`hash-bucket` or `hash-range`).
  - Injects the filter into both source CTEs.
  - Supports `includeOrderBy` toggle (used to suppress ordering for some internal operations).
- Helper `buildHashFilterCondition` is exported for reuse by both the executor and SQL generator.
- The executor relies on `buildSourceSQL` to respect table vs query sources, ensuring filters stay consistent with the UI-configured sources.

---

## 5. Code Layout

```
src/features/comparison/
├─ algorithms/
│  ├─ range-hashdiff/
│  │  └─ executor.ts                  # Core hash-bucket executor
│  ├─ hash-bucket-algorithm.ts        # Algorithm wrapper with cost estimation
│  ├─ join-algorithm.ts               # Traditional full outer join
│  ├─ sampling-algorithm.ts           # Sampling-based comparison
│  ├─ types.ts                        # Algorithm interfaces
│  ├─ registry.ts                     # Algorithm selection & registration
│  └─ index.ts                        # Public exports
├─ hooks/use-comparison-execution.ts  # Orchestrates algorithm execution
└─ utils/sql-generator.ts             # Hash-filter aware SQL generation

tests/unit/sql-generator.test.ts      # Hash-filter predicate coverage
```

The algorithm pattern allows easy extension: new comparison strategies can be added by implementing `ComparisonAlgorithm` and registering in `registry.ts`.

---

## 6. Store & UI Considerations

- Advanced options now expose a *Comparison method* picker with four modes: `'auto'`, `'hash-bucket'`, `'join'`, `'sampling'`.
- **Auto mode** uses cost-based algorithm selection:
  - JoinAlgorithm preferred for small datasets (≤500k rows) with low column counts.
  - HashBucketAlgorithm preferred for large datasets (>1M rows) or wide tables.
  - Selection is logged to console for transparency.
- Schema analysis attempts to pull `num_rows` metadata for Parquet sources; when available, algorithms use it for cost estimation and adaptive bucket sizing.
- `useComparisonExecution` orchestrates the selected algorithm:
  - **Hash-bucket path**: Stages pre-hashed tables, schedules ranges via a priority queue (largest first), streams results without rescanning the original sources, publishes granular progress updates.
  - **Join path**: Materialises via a single SQL statement when data fits in memory, no progress tracking.
  - **Sampling path**: Executes comparison on a random sample, returns sampling metadata.
- Execution publishes granular progress (when supported) through a `comparisonExecutionProgress` map in the app store. The `ComparisonExecutionProgressCard` surfaces:
  - Current stage (queued, counting, splitting, inserting, bucket-complete, finalizing, completed, partial, cancelled, failed).
  - Progress bar showing completed vs total segments.
  - Rows scanned and differences found.
  - Current bucket details (depth, modulus, bucket number, per-side row counts).
  - Elapsed time and cancel/finish-early buttons.
- Users can cancel an in-flight comparison; the executor responds to `AbortSignal`, stops launching new bucket queries, and drops partially generated results.
- Users can finish early (hash-bucket only); the executor aborts gracefully, preserves partial results, and marks the comparison as partial. The viewer displays a partial-results banner.

---

## 7. Validation

- **Unit tests**: `tests/unit/sql-generator.test.ts` ensures the generated SQL includes bucket predicates for both sources and respects join-key mappings.
  - Tests verify `hash-bucket` predicate generation with modulus and bucket parameters.
  - Tests verify join key mappings are applied correctly to source B predicates.
  - Tests verify `hash-range` predicate generation with UBIGINT ranges.
- **Manual sanity checks**:
  1. Configure two small tables with known diffs and verify results match the previous implementation.
  2. Use large synthetic tables (e.g., ≥5 M rows) and confirm execution completes without WASM OOMs.
  3. Confirm subsequent viewer interactions (sorting, filtering) behave as before because schema is unchanged.
  4. Test cancellation and finish-early flows with long-running comparisons.
- **Outstanding gaps**:
  - Jest suite requires `yarn test:unit`; currently fails upstream due to unrelated TypeScript declarations (`WebkitBackdropFilter`). Resolve in core repo if we need CI coverage.
  - No automated integration tests yet; consider adding DuckDB-backed fixtures.
  - No automated benchmark suite for large-table performance regression detection.

---

## 8. Completed Optimizations & Future Iterations

### Completed
1. ✅ **Progress instrumentation**: Full progress tracking with stage, bucket counts, row counts, current bucket details, and elapsed time display.
2. ✅ **Adaptive bucket sizing**: `rowThreshold`, `splitFactor`, and `maxDepth` are dynamically tuned based on dataset size with safety limits.
3. ✅ **Algorithm registry pattern**: Extensible architecture supporting multiple comparison strategies with cost-based auto-selection.
4. ✅ **Cancellation & finish-early**: Users can cancel comparisons or finish early with partial results.

### Future Iterations (Optional)
1. Cache row-count probes to avoid repeated scans when re-running in quick succession.
2. ~~Investigate combining struct-hash pre-filtering with per-column diff materialisation~~ - Not recommended: requires per-column status anyway, individual column comparisons are better optimized, and hash overhead would exceed benefits.
3. Add automated large-table benchmarks to detect performance regressions.
4. Consider parallel bucket processing for multi-core environments (though DuckDB-WASM is single-threaded).

---

## 9. Checklist

- [x] Bucket-aware SQL generator helper
- [x] Hash-bucket executor orchestrating `COUNT` + `INSERT` loop
- [x] Hook integration & table lifecycle handling
- [x] Basic Jest coverage for SQL generation
- [x] Progress instrumentation with UI components
- [x] Algorithm registry pattern with cost-based selection
- [x] Adaptive bucket sizing with safety limits
- [x] Cancellation and finish-early support
- [ ] Automated large-table benchmark suite
- [ ] Row-count probe caching
- [ ] Integration test fixtures

Keep this document updated as the executor evolves so the next engineer can quickly grasp responsibilities and outstanding work.
