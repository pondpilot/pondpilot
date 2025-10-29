import { PersistentDataSourceId } from './data-source';
import {
  ARROW_STREAMING_BATCH_SIZE,
  ColumnSortSpecList,
  DataTable,
  DBTableOrViewSchema,
} from './db';
import { LocalEntryId } from './file-system';
import { NewId } from './new-id';
import { SQLScriptId } from './sql-script';

export type TabId = NewId<'TabId'>;

export const MAX_PERSISTED_STALE_DATA_ROWS = ARROW_STREAMING_BATCH_SIZE;
export const MAX_DATA_VIEW_PAGE_SIZE = 100;

export type StaleData = {
  schema: DBTableOrViewSchema;
  data: DataTable;
  rowOffset: number;
  realRowCount: number | null;
  estimatedRowCount: number | null;
};

export type TabDataViewStateCache = {
  dataViewPage: number | null;
  tableColumnSizes: Record<string, number> | null;
  sort: ColumnSortSpecList | null;
  staleData: StaleData | null;
};

export type TabType = 'script' | 'data-source' | 'schema-browser' | 'comparison';

export interface TabBase {
  readonly type: TabType;
  id: TabId;

  // This is used to be able to restore the tab after restart
  dataViewStateCache: TabDataViewStateCache | null;
}

export interface ScriptTab extends TabBase {
  readonly type: 'script';
  sqlScriptId: SQLScriptId;
  dataViewPaneHeight: number;
  editorPaneHeight: number;
  lastExecutedQuery: string | null;
}

export interface FlatFileDataSourceTab extends TabBase {
  readonly type: 'data-source';
  readonly dataSourceType: 'file';
  dataSourceId: PersistentDataSourceId;
}

// The reason why we do not create flat data sources and treat tabs
// that show local database objects same as other files is that it allows
// us to easily restore app after restart or when database has been changed
// externally, or when the user decides to change database alias.
// Tab knows the qualified name of the object in the database, and the rest
// can be inferred. This causes more complex controller functions, but simplifies
// state management and data view model.
export interface LocalDBDataTab extends TabBase {
  readonly type: 'data-source';
  readonly dataSourceType: 'db';

  dataSourceId: PersistentDataSourceId;

  /**
   * The type of the object in the database.
   */
  objectType: 'table' | 'view';

  /**
   * Name of the schema in the database.
   */
  schemaName: string;

  /**
   * Name of the table/view in the database.
   */
  objectName: string;
}

export interface SchemaBrowserTab extends TabBase {
  readonly type: 'schema-browser';
  // Can be a folder ID, data source ID, or null for all data sources
  sourceId: PersistentDataSourceId | LocalEntryId | null;
  // Source type to differentiate between folder and data source
  sourceType: 'folder' | 'file' | 'db' | 'all';
  // Schema name for database-specific views
  schemaName?: string;
  // Object names (tables/views) for object-specific views. Sorted lexicographically
  objectNames?: string[];
  // For visualizing relationships and positions
  layoutState?: Record<string, unknown>;
}

// Comparison tab types

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
}

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
   * User-specified join columns (REQUIRED before execution).
   * SECURITY: Validate these exist in schemaComparison.commonColumns before use.
   * Always properly quote/escape as SQL identifiers.
   */
  joinColumns: string[];

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

  // Columns to compare (default: all common columns)
  compareColumns: string[] | null; // null = all common

  // Result filtering (affects SQL query for performance)
  // Default: true (recommended for large datasets)
  showOnlyDifferences: boolean;

  // Comparison mode
  compareMode: 'strict' | 'coerce'; // strict = exact match, coerce = type conversion
}

export interface ComparisonTab extends TabBase {
  readonly type: 'comparison';

  // Name of the comparison (user-editable)
  name: string;

  // Configuration state
  config: ComparisonConfig | null; // null = not configured yet

  // Schema analysis (cached after first analysis)
  schemaComparison: SchemaComparisonResult | null;

  // UI state - true when viewing results, false when configuring
  viewingResults: boolean;

  // Last execution timestamp (for refresh detection)
  lastExecutionTime: number | null;
}

export type AnyFileSourceTab = FlatFileDataSourceTab | LocalDBDataTab;
export type AnyTab = ScriptTab | AnyFileSourceTab | SchemaBrowserTab | ComparisonTab;
export type TabReactiveState<T extends AnyTab> = T extends ScriptTab
  ? Omit<ScriptTab, 'dataViewStateCache'>
  : T extends FlatFileDataSourceTab
    ? Omit<FlatFileDataSourceTab, 'dataViewStateCache'>
    : T extends SchemaBrowserTab
      ? Omit<SchemaBrowserTab, 'dataViewStateCache'>
      : T extends ComparisonTab
        ? Omit<ComparisonTab, 'dataViewStateCache'>
        : Omit<LocalDBDataTab, 'dataViewStateCache'>;
