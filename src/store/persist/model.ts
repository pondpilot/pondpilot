import { ContentViewPersistence } from '@models/content-view';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { DBSchema } from 'idb';
import { LocalEntryId, LocalEntryPersistence } from '@models/file-system';
import { DataSourceId, DataSourcePersistece } from '@models/data-source';
import {
  CONTENT_VIEW_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
} from './const';

export type AppIdbSchema = DBSchema & {
  [TAB_TABLE_NAME]: {
    key: TabId;
    value: AnyTab;
  };
  [SQL_SCRIPT_TABLE_NAME]: {
    key: SQLScriptId;
    value: SQLScript;
  };
  [CONTENT_VIEW_TABLE_NAME]: {
    key: keyof ContentViewPersistence;
    value: ContentViewPersistence[keyof ContentViewPersistence];
  };
  [LOCAL_ENTRY_TABLE_NAME]: {
    key: LocalEntryId;
    value: LocalEntryPersistence;
  };
  [DATA_SOURCE_TABLE_NAME]: {
    key: DataSourceId;
    value: DataSourcePersistece;
  };
};
