/**
 * Common interface for persistence adapters (IndexedDB and SQLite)
 */
export interface PersistenceAdapter {
  // Basic CRUD operations
  get<T>(table: string, key: string): Promise<T | undefined>;
  put<T>(table: string, value: T, key?: string): Promise<void>;
  delete(table: string, key: string): Promise<void>;
  clear(table: string): Promise<void>;
  
  // Bulk operations
  getAll<T>(table: string): Promise<T[]>;
  putAll<T>(table: string, items: Array<{ key: string; value: T }>): Promise<void>;
  deleteAll(table: string, keys: string[]): Promise<void>;
}

// Table names used in persistence
export const PERSISTENCE_TABLES = {
  DATA_SOURCES: 'data_sources',
  LOCAL_ENTRIES: 'local_entries',
  SQL_SCRIPTS: 'sql_scripts',
} as const;

export type PersistenceTable = typeof PERSISTENCE_TABLES[keyof typeof PERSISTENCE_TABLES];