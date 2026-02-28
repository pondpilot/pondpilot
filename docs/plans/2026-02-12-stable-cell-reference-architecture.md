# Stable Notebook Cell References Architecture Plan

## Target Architecture

1. Design goal: cell references must be stable under reorder, insert, delete, and copy operations.
2. Constraint: no positional identity (`__cell_N`) anywhere in runtime semantics.
3. Principle: separate machine identity from human naming.

## Phase 0: Freeze The Contract (Spec First)

1. Canonical identity is `cell.id` (UUID, immutable).
2. Canonical reference handle is `cell.ref` (immutable, derived once from `cell.id`).
3. Optional human alias is `cell.name` (mutable, unique per notebook).
4. SQL resolution always maps `name/ref -> cell.id -> cell.ref`.
5. `order` is only presentation and default execution sequencing tie-breaker.

## Phase 1: Data Model Changes

1. Update `src/models/notebook.ts` `NotebookCell`:

```ts
type NotebookCell = {
  id: CellId;
  ref: string; // immutable, reserved prefix, e.g. __pp_cell_<12hex>
  name: string | null; // user alias, unique case-insensitive
  content: string;
  type: 'sql' | 'markdown';
  order: number;
  dependsOn?: CellId[]; // derived/cache, optional persistence
};
```

2. Add helper invariants in model utilities:
   - `isValidCellRef(ref)`
   - `normalizeCellName(name)`
   - `validateCellName(name, existingNames)`
3. Keep `id` generation as-is; add deterministic `makeCellRef(cellId)`.

## Phase 2: Symbol Table + Dependency Graph

1. Add `src/features/notebook/utils/cell-symbols.ts`.
2. Build symbol table per notebook render/execution pass:
   - `ref -> cellId`
   - `normalized(name) -> cellId` (if name exists)
3. Use SQL parser to extract relation identifiers from each SQL cell.
4. Resolve identifiers through symbol table and compute `dependsOn: CellId[]`.
5. Detect duplicate names and cycles and produce structured diagnostics.

## Phase 3: Execution Semantics

1. Update `src/features/notebook/hooks/use-cell-execution.ts`:
   - Always materialize canonical temp view by `cell.ref`.
   - If `cell.name` exists, materialize alias view pointing to canonical view.
2. Resolution behavior:
   - Parsed identifier matching `cell.name` or `cell.ref` resolves to canonical `cell.ref`.
3. Failure behavior:
   - On execution error, keep last successful view; mark cell `error`.
   - Mark downstream dependents `stale`.
4. Reorder behavior:
   - No stale due to reorder alone.
   - Stale only on upstream content/name/execution status changes.

## Phase 4: UX/Editor Behavior

1. Replace positional autocomplete with stable symbols:
   - Show `cell.name` first, `cell.ref` secondary.
2. Name editing:
   - Inline rename action with uniqueness validation.
   - Case-insensitive collision checks.
3. Rename refactor:
   - Use parser-guided rewrite to update downstream references safely.
   - Preview diff before apply.
4. Delete behavior:
   - If dependents exist, show dependency-aware confirmation.
   - Offer cancel or proceed with dependents marked broken/stale.

## Phase 5: Import/Export Compatibility

1. Keep `-- @name:` only as interoperability format, not runtime source of truth.
2. On import:
   - Parse `@name`, store into `cell.name`, strip/keep comment per chosen policy.
3. On export:
   - Emit `@name` from `cell.name`.
4. Drop support for `__cell_N` references internally (optional one-time compatibility rewrite if needed).

## Phase 6: Controller + Store Integration

1. Update create/duplicate/import flows in `src/controllers/notebook/notebook-controller.ts`:
   - Generate `id` and `ref` for every new cell.
   - Reset/transform names on duplicate to avoid collisions.
2. Update reorder and cell update flows in `src/features/notebook/notebook-tab-view.tsx`:
   - Remove positional stale logic tied to `__cell_N`.
   - Trigger dependency recomputation on content/name changes.
3. Add memoized graph computation hooks for performance.

## Phase 7: Testing Plan

1. Unit tests:
   - `makeCellRef` determinism and reserved-prefix validation.
   - Symbol resolution precedence and collision handling.
   - Dependency extraction correctness with parser outputs.
   - Cycle detection and topological sort.
2. Integration tests:
   - Reorder does not break references.
   - Insert/delete above referenced cells does not break references.
   - Rename updates downstream SQL correctly.
   - Duplicate notebook preserves correctness without alias conflicts.
3. Regression tests:
   - Run-all ordering with dependency DAG.
   - Stale propagation only for real upstream changes.

## Phase 8: Performance + Observability

1. Recompute dependency graph incrementally per edited cell where possible.
2. Add debug telemetry counters:
   - Dependency recompute duration.
   - Cycle count.
   - Unresolved identifier count.
3. Add guarded fallback: if parser fails, keep execution functional and surface warning.

## Suggested Delivery Slices (PR Sequence)

1. PR1: model + ref generation + controller wiring.
2. PR2: symbol table + parser-based dependency extraction + tests.
3. PR3: execution rewrite to canonical refs; remove positional semantics.
4. PR4: rename/delete UX and refactor flow.
5. PR5: import/export compatibility and cleanup.
6. PR6: integration tests + telemetry + docs.

## Definition of Done

1. Reordering any cells never changes reference correctness.
2. No runtime path depends on cell index for identity.
3. All references resolve through `cell.id`/`cell.ref` model.
4. Cycle/unresolved references are explicit, deterministic, and test-covered.
5. `__cell_N` is absent from runtime code paths.
