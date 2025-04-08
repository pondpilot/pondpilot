import { IconType } from '@features/list-view-icon';
import { PersistentDataViewId } from './data-view';
import { SQLScriptId } from './sql-script';

export type TabId = string & { readonly _: unique symbol };

export type TabLayout = {
  tableColumnWidth: Record<string, number>;
  dataViewPaneHeight: number;
};

export type TabMetaInfo = {
  name: string;
  iconType: IconType;
};

export interface TabBase {
  readonly type: 'script' | 'data-source';
  id: TabId;
  meta: TabMetaInfo;
  layout: TabLayout;
}

export interface ScriptTab extends TabBase {
  type: 'script';
  sqlScriptId: SQLScriptId;
  editorPaneHeight: number;
}

export interface FileDataSourceTab extends TabBase {
  type: 'data-source';
  dataViewId: PersistentDataViewId;
}

export interface AttachedDBDataTab extends TabBase {
  type: 'data-source';

  schemaName: string;

  /**
   * Name of the table/view in the database.
   */
  objectName: string;
}

export type AnyTab = ScriptTab | FileDataSourceTab;
