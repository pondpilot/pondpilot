import { ContentViewPersistence } from '@models/content-view';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { DBSchema } from 'idb';
import { LocalEntryId, LocalEntryPersistence } from '@models/file-system';
import { PersistentDataSourceId, AnyDataSource } from '@models/data-source';
import { DataViewCacheItem, DataViewCacheKey } from '@models/data-view';

export const APP_DB_NAME = 'app-data';
export const DB_VERSION = 1;

// Stores
export const TAB_TABLE_NAME = 'tab';
export const SQL_SCRIPT_TABLE_NAME = 'sql-script';
export const CONTENT_VIEW_TABLE_NAME = 'content-view';
export const LOCAL_ENTRY_TABLE_NAME = 'local-entry';
export const DATA_SOURCE_TABLE_NAME = 'data-source';
export const DATA_VIEW_CACHE_TABLE_NAME = 'data-view-cache';

export const ALL_TABLE_NAMES = [
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DATA_VIEW_CACHE_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
] as const;

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
    key: PersistentDataSourceId;
    value: AnyDataSource;
  };
  [DATA_VIEW_CACHE_TABLE_NAME]: {
    key: DataViewCacheKey;
    value: DataViewCacheItem;
  };
};
