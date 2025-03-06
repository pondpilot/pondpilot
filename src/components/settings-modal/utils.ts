import {
  FILE_HANDLE_DB_NAME,
  FILE_HANDLE_STORE_NAME,
  TABS_DB_NAME,
  TABS_STORE_NAME,
} from '@consts/idb';
import { openDB } from 'idb';

export const clearFileSystem = async () => {
  const root = await navigator.storage.getDirectory();

  const db = await openDB(FILE_HANDLE_DB_NAME, 1);
  const tabsdb = await openDB(TABS_DB_NAME, 1);
  await db.clear(FILE_HANDLE_STORE_NAME);
  await tabsdb.clear(TABS_STORE_NAME);

  for await (const entry of root.values()) {
    if (entry.kind === 'file') {
      await root.removeEntry(entry.name);
    } else if (entry.kind === 'directory') {
      await root.removeEntry(entry.name, { recursive: true });
    }
  }
  window.location.href = '/';
};
