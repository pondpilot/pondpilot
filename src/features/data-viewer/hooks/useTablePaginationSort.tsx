import { useAppContext } from '@features/app-context';
import { tableFromIPC } from 'apache-arrow';
import { useCallback, useMemo } from 'react';
import { useAppStore } from 'store/app-store';
import { usePaginationStore } from 'store/pagination-store';

export const useTableSort = () => {
  const { runQuery } = useAppContext();

  const setQueryRunning = useAppStore((state) => state.setQueryRunning);
  const originalQuery = useAppStore((state) => state.originalQuery);
  const setCachedResults = useAppStore((state) => state.setCachedResults);
  const activeTab = useAppStore((state) => state.activeTab);
  const queryView = useAppStore((state) => state.queryView);

  const rowsCount = usePaginationStore((state) => state.rowsCount);
  const setCachedPagination = useAppStore((state) => state.setCachedPagination);
  const limit = usePaginationStore((state) => state.limit);
  const currentPage = usePaginationStore((state) => state.currentPage);
  const setSort = usePaginationStore((state) => state.setSort);
  const sort = usePaginationStore((state) => state.sort);
  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);

  const totalPages = useMemo(() => Math.ceil(rowsCount / limit), [rowsCount, limit]);

  const updateCache = useCallback(
    (result: any, page: number, sortState = sort) => {
      if (result && activeTab && !queryView) {
        setCachedResults(activeTab.path, tableFromIPC(result.data));
        setCachedPagination(activeTab.path, {
          rowsCount,
          limit,
          currentPage: page,
          sort: sortState,
        });
      }
    },
    [activeTab, queryView, setCachedResults, setCachedPagination, rowsCount, limit, sort],
  );

  const executeQuery = useCallback(
    async (query: string, page: number) => {
      setQueryRunning(true);
      const offset = (page - 1) * limit;
      return runQuery({
        query,
        limit,
        offset,
        isPagination: true,
      });
    },
    [setQueryRunning, limit, runQuery],
  );

  const handleSort = useCallback(
    async (id: string) => {
      const current = sort.field === id ? sort.direction : null;
      const newDir = !current ? 'asc' : current === 'asc' ? 'desc' : null;

      setSort({
        field: newDir ? id : null,
        direction: newDir,
      });

      const query = !newDir
        ? originalQuery
        : `select * from (${originalQuery}) order by "${id}" ${newDir}`;

      const result = await executeQuery(query, currentPage);
      updateCache(result, currentPage, {
        field: id,
        direction: newDir,
      });
    },
    [sort, setSort, originalQuery, executeQuery, currentPage, updateCache],
  );

  const handlePaginationChange = useCallback(
    async (page: number) => {
      setCurrentPage(page);

      const query = sort.field
        ? `select * from (${originalQuery}) order by "${sort.field}" ${sort.direction}`
        : originalQuery;

      const result = await executeQuery(query, page);
      updateCache(result, page);
    },
    [setCurrentPage, sort.field, sort.direction, originalQuery, executeQuery, updateCache],
  );

  const onNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      handlePaginationChange(currentPage + 1);
    }
  }, [currentPage, totalPages, handlePaginationChange]);

  const onPrevPage = useCallback(() => {
    if (currentPage > 1) {
      handlePaginationChange(currentPage - 1);
    }
  }, [currentPage, handlePaginationChange]);

  return { handleSort, handlePaginationChange, onNextPage, onPrevPage };
};
