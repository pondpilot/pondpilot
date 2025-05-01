import { useCallback, useState, useRef } from 'react';
import { DBColumn } from '@models/db';
import { isNumberType, stringifyTypedValue } from '@utils/db';
import { CancelledOperation, ColumnAggregateType, DataAdapterApi } from '@models/data-adapter';
import { useDidUpdate } from '@mantine/hooks';

export const useColumnSummary = (dataAdapter: DataAdapterApi) => {
  const [columnTotal, setColumnTotal] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [columnAggType, setColumnAggType] = useState<ColumnAggregateType>('count');

  // Cache to store previously calculated column summaries
  const summaryCache = useRef<Map<string, string>>(new Map());

  const calculateColumnSummary = useCallback(
    async (column: DBColumn | null) => {
      if (!column) {
        setColumnTotal(null);
        setIsLoading(false);
        return;
      }

      try {
        const isNumeric = isNumberType(column.sqlType);

        // for now we do not allow user to choose the aggregate type
        const aggType = isNumeric ? 'sum' : 'count';
        setColumnAggType(aggType);

        const cacheKey = column.name;

        if (summaryCache.current.has(cacheKey)) {
          const cachedValue = summaryCache.current.get(cacheKey);
          setColumnTotal(cachedValue || null);
          return;
        }

        setColumnTotal(null);
        setIsLoading(true);

        const totalValue = await dataAdapter.getColumnAggregate(column.name, aggType);

        setIsLoading(false);

        if (totalValue !== undefined) {
          // for now we do not allow user to choose the aggregate type so we can't use the type from the column like date, timestamp etc.
          const { formattedValue } = stringifyTypedValue({ type: 'bigint', value: totalValue });

          setColumnTotal(formattedValue);

          // Cache the result
          summaryCache.current.set(cacheKey, formattedValue);
        }
      } catch (error) {
        const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;

        if (!autoCancelled) console.error('Error calculating column summary:', error);
        setIsLoading(false);
      }
    },
    [dataAdapter.getColumnAggregate],
  );

  const resetTotal = useCallback(() => {
    setColumnTotal(null);
  }, []);

  // Clear the cache when the data source changes
  useDidUpdate(() => {
    summaryCache.current.clear();
  }, [dataAdapter.dataSourceVersion]);

  return {
    columnTotal,
    isLoading,
    columnAggType,
    calculateColumnSummary,
    resetTotal,
  };
};
