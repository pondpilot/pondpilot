// Async functions to persist notebook data to IndexedDB.

import { NotebookId } from '@models/notebook';
import {
  AppIdbSchema,
  NOTEBOOK_TABLE_NAME,
  NOTEBOOK_ACCESS_TIME_TABLE_NAME,
} from '@models/persisted-store';
import { IDBPDatabase } from 'idb';

/**
 * Deletes notebooks and their access times from IndexedDB.
 */
export const persistDeleteNotebook = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedNotebookIds: Iterable<NotebookId>,
) => {
  const ids = Array.from(deletedNotebookIds);
  const tx = iDb.transaction([NOTEBOOK_TABLE_NAME, NOTEBOOK_ACCESS_TIME_TABLE_NAME], 'readwrite');

  const notebookStore = tx.objectStore(NOTEBOOK_TABLE_NAME);
  for (const id of ids) {
    await notebookStore.delete(id);
  }

  const accessTimeStore = tx.objectStore(NOTEBOOK_ACCESS_TIME_TABLE_NAME);
  for (const id of ids) {
    await accessTimeStore.delete(id);
  }

  await tx.done;
};
