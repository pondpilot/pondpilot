// Async functions to persist sql script data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import {
  AppIdbSchema,
  SCRIPT_ACCESS_TIME_TABLE_NAME,
  SQL_SCRIPT_SESSION_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
} from '@models/persisted-store';
import { SQLScriptId, SQLScriptSession } from '@models/sql-script';
import { IDBPDatabase } from 'idb';

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
  const ids = Array.from(deletedSqlScriptIds);
  const tx = iDb.transaction(
    [SQL_SCRIPT_TABLE_NAME, SCRIPT_ACCESS_TIME_TABLE_NAME, SQL_SCRIPT_SESSION_TABLE_NAME],
    'readwrite',
  );

  // Delete each SQL script
  const scriptStore = tx.objectStore(SQL_SCRIPT_TABLE_NAME);
  for (const id of ids) {
    await scriptStore.delete(id);
  }

  // Delete access time entries for deleted scripts
  const accessTimeStore = tx.objectStore(SCRIPT_ACCESS_TIME_TABLE_NAME);
  for (const id of ids) {
    await accessTimeStore.delete(id);
  }

  const sessionStore = tx.objectStore(SQL_SCRIPT_SESSION_TABLE_NAME);
  for (const id of ids) {
    await sessionStore.delete(id);
  }

  await tx.done;
};

export const persistPutSqlScriptSession = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  session: SQLScriptSession,
) => {
  const { isTransient: _isTransient, ...persisted } = session;
  await iDb.put(SQL_SCRIPT_SESSION_TABLE_NAME, persisted, session.scriptId);
};

export const persistDeleteSqlScriptSession = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  scriptId: SQLScriptId,
) => {
  await iDb.delete(SQL_SCRIPT_SESSION_TABLE_NAME, scriptId);
};
