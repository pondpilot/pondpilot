import { ContentViewPersistence } from '@models/content-view';
import { PersistentDataSourceId, AnyDataSource } from '@models/data-source';
import { LocalEntryId, LocalEntryPersistence } from '@models/file-system';
import { LEGACY_TABLE_NAMES } from '@models/persistence-tables';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { DBSchema } from 'idb';

export const APP_DB_NAME = 'app-data';
export const DB_VERSION = 1;

// Stores - Using hyphenated names for IndexedDB (web) compatibility
// Note: Tauri/SQLite backend uses underscore names (data_sources, etc.) with automatic mapping
export const TAB_TABLE_NAME = LEGACY_TABLE_NAMES.TABS; // 'tab'
export const SQL_SCRIPT_TABLE_NAME = LEGACY_TABLE_NAMES.SQL_SCRIPTS; // 'sql-script'
export const CONTENT_VIEW_TABLE_NAME = LEGACY_TABLE_NAMES.CONTENT_VIEW; // 'content-view'
export const LOCAL_ENTRY_TABLE_NAME = LEGACY_TABLE_NAMES.LOCAL_ENTRIES; // 'local-entry'
export const DATA_SOURCE_TABLE_NAME = LEGACY_TABLE_NAMES.DATA_SOURCES; // 'data-source'

export const ALL_TABLE_NAMES = [
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
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
};
