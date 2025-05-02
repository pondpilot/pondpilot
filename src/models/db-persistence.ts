export type DBPersistenceMode = 'persistent';

export interface DBPersistenceState {
  mode: DBPersistenceMode;
  dbPath: string;
  dbSize: number;
  lastSync: Date | null;
}
