// This module contains the pure, shared functions implementing
// sql script controller logic.
// By convetion the order should follow CRUD groups!

import { SQLScript, SQLScriptId } from '@models/sql-script';

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

/**
 * Implementation of SQL script deletion that only removes the scripts from the map
 * without affecting any related data.
 *
 * @param deleteSqlScriptIds - iterable of IDs of SQL scripts to delete
 * @param sqlScripts - Current SQL scripts map
 * @returns New SQL scripts map with specified scripts removed
 */
export const deleteSqlScriptImpl = (
  deleteSqlScriptIds: Iterable<SQLScriptId>,
  sqlScripts: Map<SQLScriptId, SQLScript>,
): Map<SQLScriptId, SQLScript> => {
  const deleteSet = new Set(deleteSqlScriptIds);

  return new Map(Array.from(sqlScripts).filter(([id, _]) => !deleteSet.has(id)));
};
