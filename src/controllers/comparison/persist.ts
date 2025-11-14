// Async functions to persist comparison data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { ComparisonId } from '@models/comparison';
import { AppIdbSchema, COMPARISON_TABLE_NAME } from '@models/persisted-store';
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

export const persistDeleteComparison = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedComparisonIds: Iterable<ComparisonId>,
) => {
  const tx = iDb.transaction(COMPARISON_TABLE_NAME, 'readwrite');

  // Delete each comparison
  for (const id of deletedComparisonIds) {
    await tx.objectStore(COMPARISON_TABLE_NAME).delete(id);
  }

  await tx.done;
};
