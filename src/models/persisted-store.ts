import { Comparison, ComparisonId } from '@models/comparison';
import { ContentViewPersistence } from '@models/content-view';
import { PersistentDataSourceId, AnyDataSource } from '@models/data-source';
import { LocalEntryId, LocalEntryPersistence } from '@models/file-system';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { DBSchema } from 'idb';

export const APP_DB_NAME = 'app-data';
export const DB_VERSION = 3;

// Stores
export const TAB_TABLE_NAME = 'tab';
export const SQL_SCRIPT_TABLE_NAME = 'sql-script';
export const COMPARISON_TABLE_NAME = 'comparison';
export const CONTENT_VIEW_TABLE_NAME = 'content-view';
export const LOCAL_ENTRY_TABLE_NAME = 'local-entry';
export const DATA_SOURCE_TABLE_NAME = 'data-source';
export const DATA_SOURCE_ACCESS_TIME_TABLE_NAME = 'data-source-access-time';
export const SCRIPT_ACCESS_TIME_TABLE_NAME = 'script-access-time';
export const TABLE_ACCESS_TIME_TABLE_NAME = 'table-access-time';

export const ALL_TABLE_NAMES = [
  COMPARISON_TABLE_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DATA_SOURCE_ACCESS_TIME_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
  SCRIPT_ACCESS_TIME_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
  TABLE_ACCESS_TIME_TABLE_NAME,
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
  [COMPARISON_TABLE_NAME]: {
    key: ComparisonId;
    value: Comparison;
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
  [DATA_SOURCE_ACCESS_TIME_TABLE_NAME]: {
    key: PersistentDataSourceId;
    value: number;
  };
  [SCRIPT_ACCESS_TIME_TABLE_NAME]: {
    key: SQLScriptId;
    value: number;
  };
  [TABLE_ACCESS_TIME_TABLE_NAME]: {
    key: string; // JSON array key from table-access utils.
    value: number;
  };
};
