import { useCallback, useState } from 'react';
import { formatNumber } from '@utils/helpers';
import { useAppContext } from '@features/app-context';
import { AnyTab } from '@models/tab';

export interface CalculateColumnSummaryProps {
  columnName: string | null;
  dataType: string;
}

export const useColumnSummary = (tab: AnyTab | undefined) => {
  const { executeQuery } = useAppContext();
  const [columnTotal, setColumnTotal] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [columnDataType, setColumnDataType] = useState<string | null>(null);

  const isNumericType =
    columnDataType === 'bigint' || columnDataType === 'integer' || columnDataType === 'number';

  const calculateColumnSummary = async ({ columnName, dataType }: CalculateColumnSummaryProps) => {
    if (!tab?.query.originalQuery) {
      return;
    }
    try {
      const isNumeric = dataType === 'bigint' || dataType === 'integer' || dataType === 'number';

      setColumnDataType(dataType);
      setColumnTotal(null);

      if (columnName === null) {
        setColumnTotal(null);
        return;
      }

      const summaryQuery = isNumeric
        ? `SELECT sum("${columnName}") AS total FROM (${tab?.query.originalQuery});`
        : `SELECT count("${columnName}") AS total FROM (${tab?.query.originalQuery});`;

      setIsCalculating(true);
      const queryResult = await executeQuery(summaryQuery);
      setIsCalculating(false);

      const totalValue = queryResult.toArray()[0].toJSON().total;
      setColumnTotal(formatNumber(totalValue as number));
    } catch (e) {
      setIsCalculating(false);
    }
  };

  const resetTotal = useCallback(() => {
    setColumnTotal(null);
  }, []);

  return {
    columnTotal,
    isCalculating,
    isNumericType,
    calculateColumnSummary,
    resetTotal,
  };
};
