import { DataSourceIconType, DataSourceId } from './data-source';
import { SQLScriptId } from './sql-script';

export type TabId = string & { readonly _: unique symbol };

export type TabLayout = {
  tableColumnWidth: Record<string, number>;
  editorPaneHeight: number;
  dataViewPaneHeight: number;
};

export type TabMetaInfo = {
  name: string;
  iconType: DataSourceIconType;
};

export type Tab = {
  id: TabId;
  meta: TabMetaInfo;
  sqlScriptId: SQLScriptId | null;
  dataSourceId: DataSourceId | null;
  layout: TabLayout;
};
