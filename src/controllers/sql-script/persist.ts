// Async functions to persist sql script data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { IDBPDatabase } from 'idb';

import { AppIdbSchema, SQL_SCRIPT_TABLE_NAME } from '@models/persisted-store';
import { SQLScriptId } from '@models/sql-script';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

export const persistDeleteSqlScript = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedSqlScriptIds: Iterable<SQLScriptId>,
) => {
  const tx = iDb.transaction(SQL_SCRIPT_TABLE_NAME, 'readwrite');

  // Delete each SQL script
  for (const id of deletedSqlScriptIds) {
    await tx.objectStore(SQL_SCRIPT_TABLE_NAME).delete(id);
  }

  await tx.done;
};
