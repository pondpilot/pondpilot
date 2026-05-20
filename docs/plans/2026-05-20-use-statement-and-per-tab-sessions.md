# Plan: Per-Tab DuckDB Sessions and USE Statement Support

## Validation Commands

- yarn lint
- yarn typecheck
- yarn test:unit
- yarn test

### Task 1: Extend connection pool with pinning and background reservation

- [x] In `src/features/duckdb-context/duckdb-context.tsx:88-89`, raise `DEFAULT_MAX_POOL_SIZE` to 50 and the upper clamp to 100
- [x] In `src/features/duckdb-context/duckdb-connection-pool.ts`, add private state: `_pinnedTabs: Map<TabId, number>`, `_pinnedLruOrder: TabId[]`, `_backgroundReservation: number` (default 5)
- [x] Implement `pinForTab(tabId: TabId): Promise<AsyncDuckDBPooledConnection>` — returns existing pin if present (touches LRU), else acquires from pool and records the pin
- [x] Implement `unpinTab(tabId: TabId): Promise<void>` — runs state reset, removes from `_pinnedTabs`, releases via existing `_releaseConnection`
- [x] Implement `getBackgroundConnection(): Promise<AsyncDuckDBPooledConnection>` — acquires a connection guaranteed not to be a pinned index, never blocks longer than the timeout
- [x] Implement `private async _resetConnectionState(conn)` that issues, in order: `USE memory; SET search_path TO main; ROLLBACK;` (no-op if no txn), then any cleanup needed for temp tables (DuckDB drops them when a connection-equivalent reset is performed; verify in REPL during implementation and adjust)
- [x] Guard `_getConnection` so pinnable acquisition never returns a connection currently in `_pinnedTabs.values()` and background acquisition never returns one outside the reserved slice
- [x] Add unit tests in `tests/unit/duckdb-connection-pool/` covering pin/unpin, LRU touch order, background reservation isolation, and state-reset call ordering

### Task 2: Per-script session state model and persistence

- [x] In `src/models/sql-script.ts`, add `SQLScriptSession = { scriptId: SQLScriptId; currentCatalog: string | null; currentSchema: string | null; isTransient: boolean }`
- [x] In `src/store/app-store.tsx`, add `sqlScriptSessions: Map<SQLScriptId, SQLScriptSession>` plus actions `setScriptSession`, `clearScriptSession`, `markTransient`, `clearTransient`
- [x] Add a persist controller for sessions in `src/controllers/sql-script/persist.ts` (or a sibling file) that writes catalog/schema only — never `isTransient`
- [x] Register the new IndexedDB object store in `src/models/db-persistence.ts` and bump the schema version with a migration that creates an empty store
- [x] On boot, hydrate `sqlScriptSessions` from IndexedDB, forcing `isTransient: false` for every entry

### Task 3: Background-caller audit

- [x] Grep all `pool.getPooledConnection`, `pool.query`, and `pool.queryAbortable` callers in `src/` (excluding `src/features/tab-view/views/script-tab-view.tsx:195`)
- [x] Migrate `src/controllers/db/duckdb-meta.ts:315`, `src/features/duckdb-context/duckdb-context.tsx:450-504` init queries, `src/features/schema-browser/utils/schema-extraction.ts:29`, all `src/features/comparison/algorithms/**`, all `src/features/datasource-wizard/**`, `src/features/tab-view/hooks/use-column-summary.tsx`, `src/utils/schema-context-service.ts`, and AI assistant context-gathering paths to `getBackgroundConnection`
- [x] Refactor `pool.query` and `pool.queryAbortable` top-level helpers to route through the background reservation internally so any remaining string-only callers stay safe
- [x] Verify the data-source wizard's `ATTACH/DETACH` flows still work since they ran on shared connections before
- [x] Add a lint guard or code-review checklist note: new `pool.getPooledConnection` calls should be challenged

### Task 4: Tab-lifecycle wiring for pinned connections

- [x] In `src/features/tab-view/views/script-tab-view.tsx:runScriptQuery`, replace `pool.getPooledConnection()` with `pool.pinForTab(tab.id)`
- [x] Immediately after acquiring the pin, if `sqlScriptSessions.get(scriptId)` has a non-null `currentCatalog`, issue `USE "<catalog>"."<schema>"` (or just `USE "<catalog>"` if schema is null) using `toDuckDBIdentifier`
- [x] In `src/controllers/tab/tab-controller.ts:deleteTab` (~line 1131), call `pool.unpinTab(tabId)` for every deleted script tab before the tab is removed from store
- [x] Cancel any in-flight query for a tab before unpinning (existing cancellation plumbing applies)
- [x] On `pool.close()` / app teardown, iterate `_pinnedTabs` and unpin each

### Task 5: Unblock USE in validator and fix misplaced comment

- [x] In `src/utils/editor/sql.ts`, add `SQLStatement.USE` to `StatementsAllowedInScripts` (lines 134-160)
- [x] Move the `// CTE can be anything…` comment from line 129 up to `[SQLStatement.WITH]: false,` where it belongs; remove it from the USE row
- [x] Add a unit test in `tests/unit/` asserting `validateStatements` returns `[]` for a script containing `USE memory;`
- [x] Add a unit test asserting FlowScope (`splitSQLByStats`) emits one statement for `USE foo;` and two for `USE foo; SELECT 1;`

### Task 6: Read-back hook for session state after each run

- [x] After the final user statement in `script-tab-view.tsx:runScriptQuery` (success and failure paths both), run `SELECT current_database() AS db, current_schema() AS schema` on the pinned connection
- [x] Call `setScriptSession(scriptId, { currentCatalog: db, currentSchema: schema, isTransient: false })` with the result
- [x] Wrap the read-back in its own try/catch — log a warning and continue; never let it surface to the user

### Task 7: Catalog and schema toolbar dropdown UI

- [x] Add a `ScriptSessionSelector` component under `src/features/script-editor/` (or the existing script-tab toolbar location) containing two Mantine `Select`s: catalog and schema
- [x] Populate the catalog list from the existing `dataSources` / `dataExplorer` store (already enumerates attached databases); for the schema list, query `SELECT schema_name FROM duckdb_schemas() WHERE catalog_name = ?` via `getBackgroundConnection` and cache per catalog
- [x] Bind value to `sqlScriptSessions.get(scriptId)?.currentCatalog` / `currentSchema`; on change call `setScriptSession` — no DB call until next run
- [x] If `session.isTransient === true`, render a small badge ("Transient session") with a tooltip explaining temp tables and SET values are not preserved
- [x] Style consistent with existing toolbar selectors (see `src/features/tab-view/components/data-view-info-pane/` for reference)

### Task 8: LRU soft-eviction with toast and badge

- [x] In `pool.pinForTab`, when `_pinnedTabs.size >= _maxSize - _backgroundReservation` AND the requesting tab is not already pinned, take the LRU tab from `_pinnedLruOrder` and evict it: run `_resetConnectionState`, drop from `_pinnedTabs`, then proceed with the new pin
- [x] Add a pool-level `onTabEvicted` constructor callback fired with the evicted tabId
- [x] In `src/features/duckdb-context/duckdb-context.tsx` where the pool is constructed, wire `onTabEvicted`: look up the scriptId from the tab, snapshot its current catalog/schema from the store (already up to date thanks to Task 6's read-back), call `markTransient(scriptId, true)`, and dispatch `showWarning` with a one-time toast
- [x] In `pinForTab`, when re-pinning a tabId that had been evicted, call `clearTransient(scriptId)` and replay the stored catalog/schema as in Task 4

### Task 9: Tests

- [x] Unit tests in `tests/unit/duckdb-connection-pool/` covering Task 1 and Task 8 behaviors (pin/unpin/background/LRU/eviction callback)
- [x] Unit test in `tests/unit/` confirming `validateStatements` accepts `USE foo;` after Task 5
- [x] Integration test (`tests/integration/`): two script tabs A and B; in A run `USE memory; CREATE TEMP TABLE t AS SELECT 42;` then in B run `SELECT * FROM t;` — expect failure (table not visible across tabs); then run `SELECT * FROM t;` in A — expect success
- [x] Integration test: in script A run `USE memory.information_schema;`, close the app or reload the page, reopen the script — dropdown reflects `information_schema` and next run executes there
- [x] Integration test: change the catalog dropdown to a different attached database, click Run on an empty statement (or a no-op `SELECT 1`), confirm `current_database()` matches the dropdown value
- [x] Integration test: programmatically open enough script tabs to exceed `_maxSize - _backgroundReservation`, run a query in each, then run in the oldest — eviction toast appears, "Transient session" badge renders on the evicted tab
- [x] Run all `Validation Commands` clean
