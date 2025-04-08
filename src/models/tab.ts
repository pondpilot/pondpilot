import { IconType } from '@features/list-view-icon';
import { DataSourceId } from './data-source';
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

export interface DataSourceTab extends TabBase {
  type: 'data-source';
  dataSourceId: DataSourceId;
}

export type AnyTab = ScriptTab | DataSourceTab;
