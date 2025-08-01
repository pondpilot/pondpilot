import { isTauriEnvironment } from '@utils/browser';
import { IDBPDatabase } from 'idb';

import { IndexedDBAdapter } from './indexeddb-adapter';
import { SQLiteAdapter } from './sqlite-adapter';
import { PersistenceAdapter } from './types';

export * from './types';

/**
 * Creates the appropriate persistence adapter based on the environment
 */
export function createPersistenceAdapter(
  idbConnection?: IDBPDatabase | null,
): PersistenceAdapter | null {
  if (isTauriEnvironment()) {
    return new SQLiteAdapter();
  }
  if (idbConnection) {
    return new IndexedDBAdapter(idbConnection);
  }
  return null;
}
