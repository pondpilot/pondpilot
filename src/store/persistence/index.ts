import { IDBPDatabase } from 'idb';
import { isTauriEnvironment } from '@utils/browser';
import { PersistenceAdapter } from './types';
import { SQLiteAdapter } from './sqlite-adapter';
import { IndexedDBAdapter } from './indexeddb-adapter';

export * from './types';

/**
 * Creates the appropriate persistence adapter based on the environment
 */
export function createPersistenceAdapter(idbConnection?: IDBPDatabase | null): PersistenceAdapter | null {
  if (isTauriEnvironment()) {
    return new SQLiteAdapter();
  } else if (idbConnection) {
    return new IndexedDBAdapter(idbConnection);
  }
  return null;
}