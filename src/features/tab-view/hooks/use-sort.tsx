import { useState, useCallback } from 'react';

import { ColumnSortSpec } from '@models/db';

export const useSort = () => {
  const [sortParams, setSortParams] = useState<ColumnSortSpec | null>();

  /**
   * Updates sort parameters based on the selected column
   * @param sortField Column name to sort by
   * @returns The new sort parameters
   */
  const updateSortParams = useCallback(
    (sortField: string): ColumnSortSpec | null => {
      if (sortParams?.column === sortField) {
        if (sortParams.order === 'asc') {
          return { column: sortField, order: 'desc' };
        }
        return null;
      }
      return { column: sortField, order: 'asc' };
    },
    [sortParams],
  );

  /**
   * Handles sort operation when a column header is clicked
   */
  const handleSort = useCallback(
    (sortField: string) => {
      const newSortParams = updateSortParams(sortField);
      setSortParams(newSortParams);
      return newSortParams;
    },
    [updateSortParams],
  );

  /**
   * Resets the sort parameters
   */
  const resetSort = useCallback(() => {
    setSortParams(null);
  }, []);

  return {
    sortParams,
    handleSort,
    resetSort,
  };
};
