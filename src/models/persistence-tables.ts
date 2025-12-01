/**
 * Persistence table names for different platforms
 *
 * Platform differences:
 * - IndexedDB (Web): Uses hyphenated names for backward compatibility
 * - SQLite (Tauri): Uses underscore names for SQL convention
 * - The Tauri backend automatically maps from hyphenated to underscore names
 */

// Modern table names - used by SQLite/Tauri backend
export const PERSISTENCE_TABLES = {
  DATA_SOURCES: 'data_sources',
  LOCAL_ENTRIES: 'local_entries',
  SQL_SCRIPTS: 'sql_scripts',
  TABS: 'tabs',
  CONTENT_VIEW: 'content_view',
  COMPARISONS: 'comparisons',
} as const;

// Legacy hyphenated names - used by IndexedDB for backward compatibility
export const LEGACY_TABLE_NAMES = {
  DATA_SOURCES: 'data-source',
  LOCAL_ENTRIES: 'local-entry',
  SQL_SCRIPTS: 'sql-script',
  TABS: 'tab',
  CONTENT_VIEW: 'content-view',
  COMPARISONS: 'comparison',
} as const;

// Type exports
export type PersistenceTableName = (typeof PERSISTENCE_TABLES)[keyof typeof PERSISTENCE_TABLES];
export type LegacyTableName = (typeof LEGACY_TABLE_NAMES)[keyof typeof LEGACY_TABLE_NAMES];

// Helper to get all table names
export const ALL_PERSISTENCE_TABLES = Object.values(PERSISTENCE_TABLES);
export const ALL_LEGACY_TABLES = Object.values(LEGACY_TABLE_NAMES);
