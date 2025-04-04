export const APP_DB_NAME = 'app-data';
export const DB_VERSION = 1;

// Stores
export const TAB_TABLE_NAME = 'tab';
export const SQL_SCRIPT_TABLE_NAME = 'sql-script';
export const CONTENT_VIEW_TABLE_NAME = 'content-view';
export const LOCAL_ENTRY_TABLE_NAME = 'local-entry';

export const ALL_TABLE_NAMES = [
  TAB_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  CONTENT_VIEW_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
] as const;
