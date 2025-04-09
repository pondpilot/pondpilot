import { PersistentDataViewId } from './data-view';
import { SQLScriptId } from './sql-script';
import { LocalEntryId } from './file-system';

export type TabId = string & { readonly _: unique symbol };

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
  type: 'script';
  sqlScriptId: SQLScriptId;
  editorPaneHeight: number;
}

export interface FileDataSourceTab extends TabBase {
  type: 'data-source';
  readonly dataSourceType: 'file';
  dataViewId: PersistentDataViewId;
}

// The reason why we do not create persistent dataViews and treat tabs
// that show attached database objects same as other files is that it allows
// us to easily restore app after restart or when database has been changed
// externally, or when the user decides to change database alias.
// Tab knows the qualified name of the object in the database, and the rest
// can be inferred. This causes more complex controller functions, but simplifies
// state management and data view model.
export interface AttachedDBDataTab extends TabBase {
  type: 'data-source';
  readonly dataSourceType: 'db';
  /**
   * Unique identifier for the database file. You should use
   * `uniqueAlias` as assumed attached database name.
   */
  localEntryId: LocalEntryId;

  dbType: 'table' | 'view';

  /**
   * Name of the schema in the database.
   */
  schemaName: string;

  /**
   * Name of the table/view in the database.
   */
  objectName: string;
}

export type AnyTab = ScriptTab | FileDataSourceTab | AttachedDBDataTab;
