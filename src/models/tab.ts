import { ChartConfig, ViewMode } from './chart';
import {
  ComparisonId,
  ComparisonConfig,
  ComparisonSource,
  SchemaComparisonResult,
} from './comparison';
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

// Re-export comparison types for backward compatibility with existing code
export type { ComparisonConfig, ComparisonSource, SchemaComparisonResult };

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
  viewMode: ViewMode | null;
  chartConfig: ChartConfig | null;
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

  /**
   * DuckDB database name for multi-database data sources (e.g. MotherDuck).
   * When set, used instead of deriving the database name from the data source.
   */
  databaseName?: string;
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
  // DuckDB database name for multi-database data sources (e.g. MotherDuck).
  // When set, used to resolve the correct metadata entry.
  databaseName?: string;
  // For visualizing relationships and positions
  layoutState?: Record<string, unknown>;
}

export interface ComparisonTab extends TabBase {
  readonly type: 'comparison';
  comparisonId: ComparisonId;

  // UI state - true when viewing results, false when configuring
  viewingResults: boolean;

  // Last execution duration in seconds (used for refresh detection)
  lastExecutionTime: number | null;

  // Materialized comparison results table name (NOT persisted - temp tables don't survive restarts)
  comparisonResultsTable: string | null;
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
