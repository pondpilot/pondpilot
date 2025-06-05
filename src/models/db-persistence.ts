export type DBPersistenceMode = 'persistent';

// DuckDB requires "opfs://" prefix for OPFS paths
export const PERSISTENT_DB_NAME = 'pondpilot';
export const DB_FILE_PATH = `${PERSISTENT_DB_NAME}.db`;
export const DB_FULL_PATH = `opfs://${DB_FILE_PATH}`;

export interface DBPersistenceState {
  mode: DBPersistenceMode;
  dbPath: string;
  dbSize: number;
  lastSync: Date | null;
}

export const DEFAULT_STATE: DBPersistenceState = {
  mode: 'persistent',
  dbPath: DB_FULL_PATH,
  dbSize: 0,
  lastSync: null,
};
