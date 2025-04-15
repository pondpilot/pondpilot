import { useCallback, useState, useRef } from 'react';
import { formatNumber } from '@utils/helpers';
import { DBColumn } from '@models/db';
import { isNumberType } from '@utils/db';
import { DataAdapterApi } from '@models/data-adapter';
import { useDidUpdate } from '@mantine/hooks';

export const useColumnSummary = (dataAdapter: DataAdapterApi) => {
  const [columnTotal, setColumnTotal] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNumeric, setIsNumeric] = useState(false);

  // Cache to store previously calculated column summaries
  const summaryCache = useRef<Map<string, string>>(new Map());

  const calculateColumnSummary = async (column: DBColumn | null) => {
    if (!dataAdapter.getCalculatedColumnSummary || !column) {
      setColumnTotal(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsNumeric(isNumberType(column.sqlType));

      const cacheKey = column.name;

      if (summaryCache.current.has(cacheKey)) {
        const cachedValue = summaryCache.current.get(cacheKey);
        setColumnTotal(cachedValue || null);
        return;
      }

      setColumnTotal(null);
      setIsLoading(true);

      const totalValue = await dataAdapter.getCalculatedColumnSummary(column);

      setIsLoading(false);
      const formattedValue = formatNumber(totalValue);
      setColumnTotal(formattedValue);

      // Cache the result
      summaryCache.current.set(cacheKey, formattedValue);
    } catch (e) {
      setIsLoading(false);
    }
  };

  const resetTotal = useCallback(() => {
    setColumnTotal(null);
  }, []);

  const clearCache = useCallback(() => {
    summaryCache.current.clear();
  }, []);

  useDidUpdate(() => {
    clearCache();
  }, [dataAdapter]);

  return {
    columnTotal,
    isLoading,
    isNumeric,
    calculateColumnSummary,
    resetTotal,
    clearCache,
  };
};
