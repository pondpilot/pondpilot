import { PersistentDataSourceId } from './data-source';
import {
  ARROW_STREAMING_BATCH_SIZE,
  ColumnSortSpecList,
  DataTable,
  DBTableOrViewSchema,
} from './db';
import { NewId } from './new-id';
import { SQLScriptId } from './sql-script';

export type TabId = NewId<'TabId'>;

export const MAX_PERSISTED_STALE_DATA_ROWS = ARROW_STREAMING_BATCH_SIZE;
export const MAX_DATA_VIEW_PAGE_SIZE = 100;

export type StaleData = {
  schema: DBTableOrViewSchema;
  data: DataTable;
  rowOffset: number;
  totalRowCount: number | null;
  isEstimatedRowCount: boolean;
};

export type TabDataViewStateCache = {
  dataViewPage: number | null;
  tableColumnSizes: Record<string, number> | null;
  sort: ColumnSortSpecList | null;
  staleData: StaleData | null;
};

export type TabType = 'script' | 'data-source';

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
// that show attached database objects same as other files is that it allows
// us to easily restore app after restart or when database has been changed
// externally, or when the user decides to change database alias.
// Tab knows the qualified name of the object in the database, and the rest
// can be inferred. This causes more complex controller functions, but simplifies
// state management and data view model.
export interface AttachedDBDataTab extends TabBase {
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

export type AnyFileSourceTab = FlatFileDataSourceTab | AttachedDBDataTab;
export type AnyTab = ScriptTab | AnyFileSourceTab;
export type TabReactiveState<T extends AnyTab> = T extends ScriptTab
  ? Omit<ScriptTab, 'dataViewStateCache'>
  : T extends FlatFileDataSourceTab
    ? Omit<FlatFileDataSourceTab, 'dataViewStateCache'>
    : Omit<AttachedDBDataTab, 'dataViewStateCache'>;
