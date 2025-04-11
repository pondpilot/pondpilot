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
