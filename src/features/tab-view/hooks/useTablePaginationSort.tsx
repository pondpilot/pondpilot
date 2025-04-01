import { useAppContext } from '@features/app-context';
import { Tab, useUpdateTabMutation } from '@store/app-idb-store';
import { SortOrder } from '@models/common';

export const useTablePaginationSort = (tab: Tab | undefined) => {
  const { runQuery } = useAppContext();

  const { mutateAsync: updateTab } = useUpdateTabMutation();
  const totalPages = Math.ceil(tab?.dataView.rowCount || 1 / 100);

  const executeQuery = async (query: string, page: number) => {
    if (!tab) return;
    await updateTab({
      id: tab.id,
      query: {
        ...tab.query,
        state: 'fetching',
      },
    });
    const offset = (page - 1) * 100;
    return runQuery({
      query,
      offset,
      limit: 100,
      isPagination: true,
    });
  };

  const handleSort = async (id: string) => {
    if (!tab) return;

    const newOrder: SortOrder =
      tab?.sort?.column !== id ? 'asc' : tab.sort.order === 'asc' ? 'desc' : null;

    await updateTab({
      id: tab.id,
      sort: newOrder
        ? {
            column: id,
            order: newOrder,
          }
        : undefined,
    });

    const query = !newOrder
      ? tab.query.originalQuery
      : `select * from (${tab.query.originalQuery}) order by "${id}" ${newOrder}`;

    console.log({
      page: tab.pagination.page,
      query,
    });

    const result = await executeQuery(query, tab.pagination.page);
    if (result) {
      await updateTab({
        id: tab.id,
        dataView: {
          rowCount: result.pagination,
          data: result.data,
        },
        query: {
          ...tab.query,
          state: 'success',
        },
      });
    }
  };

  if (tab?.name === 'customers_10000') {
    console.log({
      tab,
    });
  }

  const handlePaginationChange = async (page: number) => {
    if (!tab) return;
    await updateTab({
      id: tab.id,
      pagination: {
        page,
      },
    });

    const query = tab.sort?.column
      ? `select * from (${tab.query.originalQuery}) order by "${tab.sort.column}" ${tab.sort.order}`
      : tab.query.originalQuery;

    const result = await executeQuery(query, page);

    if (result) {
      await updateTab({
        id: tab.id,
        dataView: {
          rowCount: result.pagination,
          data: result.data,
        },
        query: {
          ...tab.query,
          state: 'success',
        },
      });
    }
  };

  const onNextPage = () => {
    if (!tab) return;
    if (tab.pagination.page < totalPages) {
      handlePaginationChange(tab.pagination.page + 1);
    }
  };

  const onPrevPage = () => {
    if (!tab) return;
    if (tab.pagination.page > 1) {
      handlePaginationChange(tab.pagination.page - 1);
    }
  };

  return { handleSort, handlePaginationChange, onNextPage, onPrevPage };
};
