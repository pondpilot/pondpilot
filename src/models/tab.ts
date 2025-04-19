import { PersistentDataSourceId } from './data-source';
import { NewId } from './new-id';
import { SQLScriptId } from './sql-script';

export type TabId = NewId<'TabId'>;

export type DataViewLayout = {
  tableColumnWidth: Record<string, number>;
  dataViewPaneHeight: number;
};

export interface TabBase {
  readonly type: 'script' | 'data-source';
  id: TabId;
  // tab name & icon is derived from the source for some tab types,
  // so it is not available in the base type
  dataViewLayout: DataViewLayout;
}

export interface ScriptTab extends TabBase {
  readonly type: 'script';
  sqlScriptId: SQLScriptId;
  editorPaneHeight: number;
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
