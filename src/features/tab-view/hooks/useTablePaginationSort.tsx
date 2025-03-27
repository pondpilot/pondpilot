/* eslint-disable @typescript-eslint/no-unused-vars */
import { useAppContext } from '@features/app-context';
import { useCallback, useMemo } from 'react';
import { useAppStore } from '@store/app-store';
import { useActiveTabQuery, useTabMutation } from '@store/app-idb-store';

export const useTablePaginationSort = () => {
  const { runQuery } = useAppContext();

  const { data: activeTab } = useActiveTabQuery();
  const { mutateAsync: updateTab } = useTabMutation();

  const { pagination, dataView, sort } = activeTab ?? {};
  const { limit = 100 } = pagination ?? {};
  const { rowCount = 0 } = dataView ?? {};
  // rowCount / limit TODO: get limit from appsettings
  const totalPages = useMemo(() => Math.ceil(rowCount / 100), [rowCount, limit]);

  const executeQuery = useCallback(
    async (query: string, page: number) => {
      if (!activeTab) return;
      await updateTab({
        id: activeTab.id,
        query: {
          ...activeTab.query,
          state: 'fetching',
        },
      });
      const offset = (page - 1) * limit;
      return runQuery({
        query,
        offset,
        limit: 100,
        isPagination: true,
      });
    },
    [runQuery],
  );

  const handleSort = useCallback(
    async (id: string) => {
      if (!activeTab) return;
      const current = sort?.column === id ? sort.order : null;
      const newDir = !current ? 'asc' : current === 'asc' ? 'desc' : null;

      await updateTab({
        id: activeTab.id,
        sort: {
          column: id,
          order: newDir,
        },
      });

      const query = !newDir
        ? activeTab.query.originalQuery
        : `select * from (${activeTab.query.originalQuery}) order by "${id}" ${newDir}`;

      // TODO: set the result to a tab
      const result = await executeQuery(query, activeTab.pagination.page);
      await updateTab({
        id: activeTab.id,
        query: {
          ...activeTab.query,
          state: 'success',
        },
      });
    },
    [activeTab, updateTab, sort, executeQuery],
  );

  const handlePaginationChange = useCallback(
    async (page: number) => {
      if (!activeTab) return;
      await updateTab({
        id: activeTab.id,
        pagination: {
          ...activeTab.pagination,
          page,
        },
      });

      const query = sort?.column
        ? `select * from (${activeTab.query.originalQuery}) order by "${sort.column}" ${sort.order}`
        : activeTab.query.originalQuery;

      // TODO: set the result to a tab
      const result = await executeQuery(query, page);
    },
    [activeTab, updateTab, sort, executeQuery],
  );

  const onNextPage = useCallback(() => {
    if (!activeTab) return;
    if (activeTab.pagination.page < totalPages) {
      handlePaginationChange(activeTab.pagination.page + 1);
    }
  }, [activeTab, handlePaginationChange, totalPages]);

  const onPrevPage = useCallback(() => {
    if (!activeTab) return;
    if (activeTab.pagination.page > 1) {
      handlePaginationChange(activeTab.pagination.page - 1);
    }
  }, [activeTab, handlePaginationChange]);

  return { handleSort, handlePaginationChange, onNextPage, onPrevPage };
};
