import { ContentViewPersistence } from '@models/content-view';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { Tab, TabId } from '@models/tab';
import { DBSchema } from 'idb';
import { CONTENT_VIEW_TABLE_NAME, SQL_SCRIPT_TABLE_NAME, TAB_TABLE_NAME } from './const';

export type AppIdbSchema = DBSchema & {
  [TAB_TABLE_NAME]: {
    key: TabId;
    value: Tab;
  };
  [SQL_SCRIPT_TABLE_NAME]: {
    key: SQLScriptId;
    value: SQLScript;
  };
  [CONTENT_VIEW_TABLE_NAME]: {
    key: keyof ContentViewPersistence;
    value: ContentViewPersistence[keyof ContentViewPersistence];
  };
};
