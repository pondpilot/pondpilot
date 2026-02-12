# Plan: SQL Notebook

Add a full SQL Notebook experience to PondPilot — ordered SQL and markdown cells with inline results, cell referencing via DuckDB temp views, keyboard-driven navigation, and import/export (.sqlnb JSON + self-contained HTML). Built entirely from existing primitives (Monaco, dnd-kit, react-markdown, Zustand, DuckDB-WASM) with zero new dependencies.

Architecture: new `NotebookTab` tab type following the ComparisonTab pattern, `Notebook` entity persisted to IndexedDB alongside SQL scripts, per-cell `DataAdapterApi` instances for independent result rendering, and temp view auto-creation for cross-cell referencing.

## Validation Commands

- `yarn lint`
- `yarn tsc --noEmit`
- `yarn test`
- `yarn build`

### Task 1: Data Model & Persistence Foundation

Create the core data types and persistence layer for notebooks. This establishes the `Notebook` and `NotebookCell` models, adds a new IndexedDB object store, extends the Zustand store, and implements CRUD controller functions. Everything else builds on this foundation.

- [x] Create `src/models/notebook.ts` with `NotebookId` branded type, `CellId` branded type, `NotebookCellType` union (`'sql' | 'markdown'`), `NotebookCell` interface (`id`, `type`, `content`, `order`), and `Notebook` interface (`id`, `name`, `cells`, `createdAt`, `updatedAt`)
- [x] Create ID factory functions `makeNotebookId()` and `makeCellId()` following the existing `makeTabId()` pattern in `src/models/tab.ts`
- [x] Update `src/models/persisted-store.ts`: add `NOTEBOOK_TABLE_NAME = 'notebook'`, extend `AppIdbSchema` with the notebook object store, and bump `DB_VERSION` from current value to next
- [x] Update `src/store/app-store.tsx`: add `notebooks: Map<NotebookId, Notebook>` to the store state, add `notebookAccessTimes: Map<NotebookId, number>` for recency tracking, initialize both as empty Maps
- [x] Add notebook loading to the app initialization flow — load notebooks from IndexedDB on startup (follow the pattern used for `sqlScripts` loading)
- [x] Create `src/controllers/notebook/notebook-controller.ts` with CRUD functions:
  - `createNotebook(name: string): Notebook` — creates notebook with a single empty SQL cell, persists to IndexedDB, updates store
  - `deleteNotebook(notebookId: NotebookId)` — removes from store and IndexedDB, closes associated tabs
  - `renameNotebook(notebookId: NotebookId, name: string)` — updates name in store and IndexedDB
  - `updateNotebookCells(notebookId: NotebookId, cells: NotebookCell[])` — replaces cell array, persists
- [x] Create cell manipulation helpers in the same controller:
  - `addCell(notebookId: NotebookId, type: NotebookCellType, afterCellId?: CellId): NotebookCell` — inserts cell at position, reorders
  - `removeCell(notebookId: NotebookId, cellId: CellId)` — removes cell, reorders remaining
  - `moveCellUp(notebookId: NotebookId, cellId: CellId)` / `moveCellDown(...)` — swaps order with adjacent cell
  - `updateCellContent(notebookId: NotebookId, cellId: CellId, content: string)` — updates content, debounced persist
  - `updateCellType(notebookId: NotebookId, cellId: CellId, type: NotebookCellType)` — toggles between sql/markdown
- [x] Add auto-save logic with debounced persistence (follow the `ScriptEditor` debounce pattern — configurable interval, dirty tracking)
- [x] Verify: app starts without errors, notebooks load from IndexedDB on refresh, CRUD operations persist correctly

### Task 2: NotebookTab Type & Tab System Integration

Register the notebook as a first-class tab type in PondPilot's tab system. After this task, notebooks can be opened as tabs (with a placeholder view), and tab lifecycle (create, close, persist, restore on reload) works correctly.

- [x] Update `src/models/tab.ts`:
  - Add `'notebook'` to the `TabType` union
  - Create `NotebookTab` interface extending `TabBase` with fields: `type: 'notebook'`, `notebookId: NotebookId`, `activeCellId: CellId | null`
  - Add `NotebookTab` to the `AnyTab` union type
  - Update `TabReactiveState` conditional type to handle `'notebook'`
- [x] Update `src/controllers/tab/tab-controller.ts`:
  - Add `findTabFromNotebook(notebookId: NotebookId): NotebookTab | undefined` — searches existing tabs
  - Add `getOrCreateTabFromNotebook(notebookOrId: Notebook | NotebookId, setActive?: boolean): NotebookTab` — follows `getOrCreateTabFromScript` pattern exactly (check existing tab, create if needed, persist, set active)
- [x] Update `src/features/tab-view/tab-view.tsx`: add routing case `{tabType === 'notebook' && <NotebookTabView tabId={tabId} active={isActive} />}` — initially render a placeholder component
- [x] Create placeholder `src/features/notebook/notebook-tab-view.tsx` that shows notebook name and cell count (proves tab integration works)
- [x] Update tab icon mapping to show a notebook icon for the `'notebook'` tab type (use appropriate Tabler icon, e.g. `IconNotebook`)
- [x] Update tab title logic to display the notebook name in the tab bar
- [x] Handle tab close: closing a notebook tab should NOT delete the notebook (same pattern as script tabs)
- [x] Handle notebook deletion: deleting a notebook should close its tab if open
- [x] Verify: can create a notebook tab programmatically, tab appears in tab bar with correct name/icon, tab persists across page reload, closing and reopening works

### Task 3: Core Notebook UI — Cell Rendering & Reordering

Build the main notebook interface with SQL cells (Monaco editors), markdown cells (react-markdown with edit toggle), cell toolbars, add-cell buttons, and drag-and-drop reordering. This is the largest UI task and delivers the core notebook interaction model.

- [x] Create `src/features/notebook/components/notebook-cell.tsx` — the cell container component:
  - Renders SQL cells with `SqlEditor` (from `src/features/editor/sql-editor.tsx`), using unique `path` prop per cell (`notebook-${notebookId}-cell-${cellId}`) for Monaco model isolation
  - Renders markdown cells with `react-markdown` in view mode, switches to a plain textarea (or Monaco with markdown language) in edit mode on double-click
  - Cell toolbar: run button (SQL only), cell type toggle (SQL↔Markdown), move up/down, delete, drag handle
  - Visual indicators: cell number, execution status badge, focused cell highlight
  - SQL cell height auto-adjusts to content (Monaco `automaticLayout` + min/max height constraints)
- [x] Create `src/features/notebook/components/add-cell-button.tsx` — appears between cells and at the bottom:
  - "+" button that expands to show "SQL" and "Markdown" options
  - Inserts new cell at that position using `addCell()` controller
- [x] Create `src/features/notebook/components/notebook-toolbar.tsx` — toolbar above the cell list:
  - Notebook name (editable inline)
  - "Run All" button
  - "Add Cell" dropdown (SQL / Markdown)
  - Export dropdown (placeholder for Task 7)
- [x] Update `src/features/notebook/notebook-tab-view.tsx` to render the full notebook:
  - Scrollable cell list with `@dnd-kit/sortable` for drag-and-drop reordering
  - Each cell wrapped in a `SortableItem` with drag handle
  - On reorder: call `updateNotebookCells()` with new order
  - Active cell tracking: clicking a cell sets `activeCellId` on the tab
- [x] Wire up cell content changes: typing in a SQL/markdown cell calls `updateCellContent()` with debounced persistence
- [x] Wire up cell type toggling: changing a cell from SQL to Markdown (or vice versa) preserves content, updates type
- [x] Style the notebook to match PondPilot's existing design language (Mantine theme, consistent spacing, border treatment matching existing panels)
- [x] Handle empty notebook state: show a welcoming prompt with "Add your first cell" button
- [x] Verify: can add/remove/reorder cells, SQL cells have working Monaco editors with syntax highlighting and autocompletion, markdown cells render and can be edited, changes persist across reload

### Task 4: Cell Execution Engine & Inline Results

Connect SQL cells to DuckDB for execution and render results inline beneath each cell. Each cell operates independently with its own data adapter, execution state, and result view (table or chart).

- [x] Create `src/features/notebook/hooks/use-cell-execution.ts` — hook managing execution for a single SQL cell:
  - Gets a pooled DuckDB connection via `useDuckDBConnectionPool()`
  - Splits cell content into statements using `splitSQLByStats` (reuse existing utility)
  - Executes all statements; last SELECT-like statement provides the result set
  - Tracks execution state: `idle` → `running` → `success` | `error`
  - On success: stores the prepared statement reference for the DataAdapter to stream from
  - On error: stores error message with line number for display
  - Supports cancellation via AbortController
- [x] Create `src/features/notebook/hooks/use-cell-data-adapter.ts` — per-cell data adapter:
  - Wraps the existing `DataAdapterApi` pattern from `use-data-adapter.ts`
  - Creates a lightweight "virtual tab" object for each cell so the data adapter can operate independently
  - Manages its own pagination, sorting, and schema state
  - Result set is independent per cell (cell 1 showing page 2 doesn't affect cell 3)
- [x] Create `src/features/notebook/components/cell-result-view.tsx` — inline result display beneath SQL cells:
  - Renders the data table (reuse existing `Table` component from `src/components/table/`)
  - Renders charts (reuse existing `ChartView` from `src/features/chart-view/`)
  - Toggle between table and chart view per cell
  - Shows row count, execution time, error messages
  - Collapsible: click to collapse/expand results
  - Respects a max-height with internal scrolling (notebook shouldn't be dominated by one huge result)
- [x] Wire up Ctrl+Enter in SQL cells: the `onRun` prop from `SqlEditor` triggers `useCellExecution` for that cell
- [x] Implement "Run All" in notebook toolbar:
  - Executes cells sequentially from top to bottom
  - Stops on first error (with option to continue)
  - Shows progress indicator (cell 3/7 running...)
  - Updates each cell's execution state as it progresses
- [x] Display execution errors inline beneath the cell with the error message, affected line highlighted in the editor
- [x] Handle cell re-execution: running a cell again replaces its previous results (data adapter gets new source version)
- [x] Verify: can execute individual SQL cells and see results inline, Run All works sequentially, errors display correctly, pagination/sorting work per cell, results persist visually (but not data — re-execute on reload)

### Task 5: Cell Referencing via DuckDB Temp Views

Enable cross-cell data flow: each executed SQL cell's result becomes a queryable temp view that downstream cells can reference. This is the key differentiator from "just stacked editors."

- [ ] Define naming convention: cell results are available as `__cell_N` where N is the 1-based position of the cell in the notebook (not the cell ID, so reordering updates references)
  - Alternative: use user-assignable cell names (e.g., `-- @name: revenue_by_month` in a comment) — implement both: auto-generated `__cell_N` names AND optional user-defined names parsed from first-line comments
- [ ] Update `use-cell-execution.ts`: after successful execution of a SQL cell, execute `CREATE OR REPLACE TEMP VIEW __cell_N AS (cell_sql)` on the same connection
  - If cell has a user-defined name, also create `CREATE OR REPLACE TEMP VIEW user_defined_name AS (cell_sql)`
  - Handle errors gracefully (e.g., if the SQL can't be wrapped in a view because it's a multi-statement cell, skip view creation)
- [ ] Update "Run All" to use a **single DuckDB connection** for the entire notebook execution, so temp views from earlier cells are visible to later cells
- [ ] For individual cell execution, manage a **shared notebook connection** that persists across cell runs within the same notebook session (so running cell 1, then manually running cell 3, still has cell 1's view available)
- [ ] Add cell reference autocomplete: extend the SQL editor's completion provider to suggest `__cell_N` and user-defined cell names when the user types
  - Show cell preview (first line of SQL) in the autocomplete tooltip
- [ ] Add visual indicators for cell dependencies:
  - When a cell references `__cell_2`, show a subtle link/badge indicating the dependency
  - When an upstream cell is re-executed, mark downstream dependent cells as "stale" (visual indicator, not auto-re-execution)
- [ ] Handle edge cases:
  - Cell reordering: when cells are reordered, `__cell_N` numbers change — show a warning or auto-update references in downstream cells
  - Cell deletion: when a cell is deleted, warn if other cells reference it
  - Circular references: detect and prevent (cell A references cell B which references cell A)
- [ ] Verify: execute cell 1 with `SELECT 1 as x`, execute cell 2 with `SELECT * FROM __cell_1` — cell 2 shows `x: 1`. User-defined names work. Stale indicators appear when upstream cell changes.

### Task 6: Sidebar Integration & Create Flow

Make notebooks discoverable and manageable from the sidebar. Users should be able to create, find, rename, and delete notebooks with the same ease as SQL scripts.

- [ ] Update `src/features/script-explorer/script-explorer.tsx`:
  - Extend `ScriptNodeTypeToIdTypeMap` with `notebook: NotebookId`
  - Build notebook tree nodes from `store.notebooks` (same pattern as script nodes, lines 306-348)
  - Add a "Notebooks" section/group in the explorer tree (separate from SQL Scripts, with its own header)
  - Handle `onNodeClick` for notebook nodes: call `getOrCreateTabFromNotebook(notebookId, true)`
  - Add context menu for notebook nodes: Rename, Delete, Duplicate, Export
- [ ] Add "New Notebook" to the create menu:
  - Update the existing "New Script" dropdown/button to also offer "New Notebook"
  - Or add a separate "New Notebook" entry to the spotlight/command palette (`@mantine/spotlight`)
  - Keyboard shortcut: Ctrl+Alt+B (or similar, avoiding conflicts)
- [ ] Implement notebook rename inline in the sidebar (reuse the script rename pattern with `renameCallbacks`)
- [ ] Implement notebook delete with confirmation dialog (reuse existing pattern from script deletion)
- [ ] Implement notebook duplicate: creates a deep copy with "(Copy)" suffix
- [ ] Add notebook access time tracking: update `notebookAccessTimes` when a notebook is opened (for "Recent" section sorting)
- [ ] Ensure notebooks appear in the global search/spotlight results
- [ ] Verify: notebooks appear in sidebar, clicking opens them, context menu works (rename, delete, duplicate), new notebook flow works from both menu and keyboard shortcut

### Task 7: Import/Export — .sqlnb & HTML

Enable sharing notebooks via a custom JSON format and as self-contained HTML documents. The `.sqlnb` format preserves the full notebook structure for re-import; HTML export creates a static, viewable document with embedded results.

- [ ] Define the `.sqlnb` JSON format specification:
  ```json
  {
    "version": 1,
    "name": "Notebook Name",
    "cells": [
      {
        "type": "sql",
        "content": "SELECT * FROM table",
        "name": "optional_user_name"
      },
      {
        "type": "markdown",
        "content": "## Analysis\nThis shows..."
      }
    ],
    "metadata": {
      "createdAt": "2026-02-11T...",
      "pondpilotVersion": "1.x.x"
    }
  }
  ```
- [ ] Implement `.sqlnb` export:
  - Serialize current notebook to the JSON format
  - Trigger browser file download with `.sqlnb` extension
  - Wire up to the notebook toolbar export dropdown and sidebar context menu
- [ ] Implement `.sqlnb` import:
  - Accept `.sqlnb` files via the existing file picker (update accepted extensions)
  - Accept `.sqlnb` files via drag-and-drop onto the app
  - Parse JSON, validate schema, create a new Notebook entity, and open it in a tab
  - Handle validation errors gracefully (malformed JSON, missing fields, unsupported version)
- [ ] Implement HTML export:
  - Render the notebook as a self-contained HTML file
  - SQL cells: show the SQL code in a `<pre>` block with syntax highlighting (inline CSS, no external deps)
  - Markdown cells: render as HTML
  - Results: embed as HTML `<table>` elements (up to configurable row limit, e.g., 1000 rows)
  - Charts: embed as inline SVG (use Recharts' `renderToStaticMarkup` or equivalent)
  - Include minimal CSS for styling (PondPilot branding, responsive layout)
  - Add a "Generated by PondPilot" footer with link
- [ ] Register `.sqlnb` as a known file type in the app's file handling logic (so the file explorer recognizes it)
- [ ] Verify: export a notebook as `.sqlnb`, re-import it — all cells and content preserved. Export as HTML, open in browser — readable document with SQL, markdown, and result tables.

### Task 8: Keyboard Navigation & Polish

Add Jupyter-style keyboard navigation, visual polish, and quality-of-life features that make the notebook feel professional and efficient to use.

- [ ] Implement cell selection mode (Jupyter-style):
  - `Escape` in a cell editor → enters cell selection mode (blue border on selected cell, editor loses focus)
  - `Enter` in selection mode → enters edit mode (cursor in editor)
  - `ArrowUp` / `ArrowDown` in selection mode → moves selection between cells
  - `Shift+Enter` → run current cell and advance selection to next cell (create new cell if at end)
  - `A` in selection mode → add cell above
  - `B` in selection mode → add cell below
  - `DD` (double-tap D) in selection mode → delete cell (with brief undo toast)
  - `M` in selection mode → convert to markdown
  - `Y` in selection mode → convert to SQL (code)
- [ ] Add cell folding/collapsing:
  - Click cell header to collapse/expand cell content
  - Collapsed cells show just the first line of content + type badge
  - Collapse all / Expand all buttons in notebook toolbar
- [ ] Add cell output collapsing:
  - Toggle to hide/show results per cell
  - Collapsed output shows just row count summary
- [ ] Add cell execution counter: show `[N]` next to each cell indicating execution order (increments on each run, like Jupyter's `In [N]:`)
- [ ] Add "Clear All Outputs" action in notebook toolbar — resets all cells to idle state, removes all result displays
- [ ] Add undo/redo for cell operations (add, delete, reorder) — at minimum, support undo of cell deletion via a toast notification with "Undo" button
- [ ] Ensure proper focus management: Tab/Shift+Tab between cell editor and cell toolbar, focus trap within modals
- [ ] Add smooth scroll-to-cell when navigating with keyboard (cell should be visible in viewport)
- [ ] Test multi-cell workflows end-to-end: create notebook, add cells, write SQL, execute, reference previous cells, reorder, export
- [ ] Verify: keyboard navigation works fluidly, cell selection mode matches expected Jupyter-like behavior, all shortcuts work, focus management is correct, exported notebooks look professional
