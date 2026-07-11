# Plan: Metadata Stats Panel

Add a third view mode ("Metadata") to the results tab alongside Table and Chart. The Metadata view provides a bird's-eye summary of all columns in a dataset: a left Summary panel showing each column as a row with type, distinct count percentage (text) or frequency distribution sparkline (numeric/date), and a right All Columns panel with horizontally scrollable detail cards showing top values (text) or histogram distributions (numeric/date).

Key decisions:
- Extend `DataAdapterApi` with new stats methods (consistent with existing chart data pattern)
- Use inline SVGs for sparklines and histograms (lightweight, no extra dependencies)
- Horizontal scroll layout for detail cards (matching Figma design)
- Lazy-load stats only when metadata view is active
- Cache stats keyed on `dataSourceVersion`

## Validation Commands

- `yarn typecheck`
- `yarn lint`
- `yarn test:unit`
- `yarn build`

### Task 1: Extend ViewMode and wire up the metadata tab

Add the `'metadata'` value to the `ViewMode` type and integrate it into the tab switching UI. Create a placeholder `MetadataView` component that renders when the metadata view mode is selected. This establishes the routing and UI entry point for all subsequent tasks.

- [x] Add `'metadata'` to the `ViewMode` type union in `src/models/chart.ts`
- [x] Update `SegmentedControl` in `src/features/tab-view/components/data-view-info-pane/data-view-info-pane.tsx` to include a "Metadata" option
- [x] Create `src/features/metadata-view/metadata-view.tsx` with a placeholder component
- [x] Update `src/features/tab-view/components/data-view/data-view.tsx` to render `MetadataView` when `viewMode === 'metadata'`
- [x] Lazy-load the MetadataView component (following the ChartView lazy-loading pattern)
- [x] Verify the tab switching works between all three modes (table, chart, metadata)

### Task 2: Extend DataAdapterApi with column stats methods

Add two new methods to the `DataAdapterApi` interface: `getColumnStats()` for summary statistics (distinct count, null count, min/max/mean) and `getColumnDistribution()` for distribution data (histogram buckets for numeric, top-N values for text). Implement the underlying DuckDB SQL queries in the data adapter. This provides the data layer for the metadata view.

- [x] Define `ColumnStats` type in `src/models/data-adapter.ts` (distinctCount, nullCount, totalCount, min, max, mean — per column type)
- [x] Define `ColumnDistribution` type in `src/models/data-adapter.ts` (buckets array for numeric with label/count, values array for text with value/count)
- [x] Add `getColumnStats(columnNames: string[])` method to `DataAdapterApi` interface
- [x] Add `getColumnDistribution(columnName: string, columnType: 'text' | 'numeric' | 'date')` method to `DataAdapterApi` interface
- [x] Add corresponding query functions to `DataAdapterQueries` interface
- [x] Implement `getColumnStats` SQL query (batch all columns in a single query using DuckDB aggregate functions: COUNT, COUNT(DISTINCT ...), MIN, MAX, AVG, COUNT(*) FILTER (WHERE col IS NULL))
- [x] Implement `getColumnDistribution` SQL query for numeric columns (use `histogram()` or generate fixed-width buckets via `WIDTH_BUCKET`)
- [x] Implement `getColumnDistribution` SQL query for text columns (GROUP BY with ORDER BY count DESC LIMIT N)
- [x] Implement `getColumnDistribution` SQL query for date/timestamp columns (bucket by appropriate time intervals)
- [x] Wire the new query functions into `use-data-adapter.ts` to expose them via the adapter API
- [x] Add unit tests for the stats SQL query generation

### Task 3: Build the useMetadataStats hook

Create a React hook that orchestrates fetching column stats and distributions when the metadata view is active. Follows the `useChartData` pattern: lazy fetch on view activation, abort on view switch, cache results keyed on `dataSourceVersion`. Returns loading states and computed stats for all columns.

- [x] Create `src/features/metadata-view/hooks/use-metadata-stats.ts`
- [x] Fetch column stats for all columns in one batch call when `viewMode === 'metadata'`
- [x] Fetch column distributions for each column (can be parallelized per column)
- [x] Cache results using `dataSourceVersion` as cache key (clear on source change)
- [x] Support abort via `AbortController` (cancel in-flight queries when switching away from metadata view)
- [x] Expose loading state (isLoading, per-column loading for distributions)
- [x] Handle errors gracefully (show error state per column, don't crash the whole view)
- [x] Add unit tests for the hook's caching and abort behavior

### Task 4: Build the Summary panel (left side)

Create the left panel component showing a table where each row represents a column in the dataset. Each row displays: type icon, column name, and either a COUNTD percentage bar (for text columns) or a frequency distribution sparkline (for numeric/date columns). Uses inline SVGs for the visualizations.

- [x] Create `src/features/metadata-view/components/summary-panel.tsx`
- [x] Render a table/list with one row per dataset column
- [x] Show column type icon (reuse existing `NamedIcon` component with type-based icons)
- [x] Show column name
- [x] For text columns: render a percentage bar showing COUNTD % (distinct count / total count) with the percentage label
- [x] For numeric columns: render an inline SVG sparkline histogram from the distribution data
- [x] For date/timestamp columns: render an inline SVG sparkline from the time-bucketed distribution
- [x] Style consistently with the existing Mantine theme (light/dark mode support)
- [x] Handle loading state (skeleton placeholders while stats are computing)

### Task 5: Build the All Columns detail panel (right side)

Create the right panel with horizontally scrollable cards, one per dataset column. Text column cards show top values as labeled items with counts. Numeric/date column cards show a larger horizontal bar histogram with axis labels. Each card header shows the column type icon, name, and count of distinct values.

- [x] Create `src/features/metadata-view/components/column-detail-panel.tsx`
- [x] Create `src/features/metadata-view/components/column-card.tsx` (individual card component)
- [x] Implement horizontal scroll container with fixed-width cards
- [x] Card header: type icon, column name, distinct value count
- [x] Text column card body: list of top values with their occurrence counts (styled as tags/pills)
- [x] Numeric column card body: horizontal bar histogram using inline SVG with axis labels (min/max on axis)
- [x] Date column card body: horizontal bar histogram bucketed by time intervals
- [x] Handle loading state per card (skeleton while distribution is loading)
- [x] Ensure horizontal scroll works smoothly (consider scroll snap for better UX)

### Task 6: Integration, polish, and tests

Wire the Summary and Detail panels into the MetadataView layout as a two-panel split. Handle edge cases: empty datasets, datasets with many columns, columns with all nulls, single-value columns. Add integration between summary row click and detail card scroll-to. Add comprehensive tests.

- [x] Compose `MetadataView` with Summary panel (left, fixed width ~450px) and Detail panel (right, flex)
- [x] Add click interaction: clicking a row in the Summary panel scrolls the detail panel to the corresponding column card
- [x] Handle empty dataset state (no columns / no rows)
- [x] Handle columns with all NULL values gracefully
- [x] Handle datasets with large column counts (50+ columns) — virtualize the summary list if needed
- [x] Show dataset-level info: total column count and row count at the top (as shown in Figma: "10 columns, 3,567 rows")
- [x] Ensure dark mode theming works for all new components
- [x] Add unit tests for Summary panel rendering
- [x] Add unit tests for Column card rendering
- [x] Add unit tests for MetadataView integration
- [x] Verify no regressions in Table and Chart views
