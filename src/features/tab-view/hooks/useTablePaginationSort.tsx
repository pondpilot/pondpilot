/* eslint-disable @typescript-eslint/no-unused-vars */
import { useAppContext } from '@features/app-context';
import { useCallback, useMemo } from 'react';
import { useAppStore } from '@store/app-store';
import { usePaginationStore } from '@store/pagination-store';

export const useTablePaginationSort = () => {
  const { runQuery } = useAppContext();

  const setQueryRunning = useAppStore((state) => state.setQueryRunning);
  const originalQuery = useAppStore((state) => state.originalQuery);

  const rowsCount = usePaginationStore((state) => state.rowsCount);
  const limit = usePaginationStore((state) => state.limit);
  const currentPage = usePaginationStore((state) => state.currentPage);
  const setSort = usePaginationStore((state) => state.setSort);
  const sort = usePaginationStore((state) => state.sort);
  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);

  const totalPages = useMemo(() => Math.ceil(rowsCount / limit), [rowsCount, limit]);

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

      // TODO: set the result to a tab
      const result = await executeQuery(query, currentPage);
    },
    [sort, setSort, originalQuery, executeQuery, currentPage],
  );

  const handlePaginationChange = useCallback(
    async (page: number) => {
      setCurrentPage(page);

      const query = sort.field
        ? `select * from (${originalQuery}) order by "${sort.field}" ${sort.direction}`
        : originalQuery;

      // TODO: set the result to a tab
      const result = await executeQuery(query, page);
    },
    [setCurrentPage, sort.field, sort.direction, originalQuery, executeQuery],
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
