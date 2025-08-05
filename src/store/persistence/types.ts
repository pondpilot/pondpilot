/**
 * Common interface for persistence adapters (IndexedDB and SQLite)
 */
export interface PersistenceAdapter {
  // Basic CRUD operations
  get: <T>(table: string, key: string) => Promise<T | undefined>;
  put: <T>(table: string, value: T, key?: string) => Promise<void>;
  delete: (table: string, key: string) => Promise<void>;
  clear: (table: string) => Promise<void>;

  // Bulk operations
  getAll: <T>(table: string) => Promise<T[]>;
  putAll: <T>(table: string, items: Array<{ key: string; value: T }>) => Promise<void>;
  deleteAll: (table: string, keys: string[]) => Promise<void>;
}

// Table names used in persistence (underscore format for backend consistency)
export const PERSISTENCE_TABLES = {
  DATA_SOURCES: 'data_sources',
  LOCAL_ENTRIES: 'local_entries',
  SQL_SCRIPTS: 'sql_scripts',
  TABS: 'tabs',
  CONTENT_VIEW: 'content_view',
  DUCKDB_SESSION: 'duckdb_session',
} as const;

// Legacy hyphenated table names (for migration)
export const LEGACY_TABLE_NAMES = {
  DATA_SOURCES: 'data-source',
  LOCAL_ENTRIES: 'local-entry',
  SQL_SCRIPTS: 'sql-script',
  TABS: 'tab',
  CONTENT_VIEW: 'content-view',
  DUCKDB_SESSION: 'duckdb-session',
} as const;

export type PersistenceTable = (typeof PERSISTENCE_TABLES)[keyof typeof PERSISTENCE_TABLES];
export type LegacyTableName = (typeof LEGACY_TABLE_NAMES)[keyof typeof LEGACY_TABLE_NAMES];
