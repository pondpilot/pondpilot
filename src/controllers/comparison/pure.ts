// This module contains the pure, shared functions implementing
// comparison controller logic.
// By convetion the order should follow CRUD groups!

import { Comparison, ComparisonId } from '@models/comparison';

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
 * Implementation of comparison deletion that only removes the comparisons from the map
 * without affecting any related data.
 *
 * @param deleteComparisonIds - iterable of IDs of comparisons to delete
 * @param comparisons - Current comparisons map
 * @returns New comparisons map with specified comparisons removed
 */
export const deleteComparisonImpl = (
  deleteComparisonIds: Iterable<ComparisonId>,
  comparisons: Map<ComparisonId, Comparison>,
): Map<ComparisonId, Comparison> => {
  const deleteSet = new Set(deleteComparisonIds);

  return new Map(Array.from(comparisons).filter(([id, _]) => !deleteSet.has(id)));
};
