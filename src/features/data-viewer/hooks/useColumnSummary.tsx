import { useCallback, useState } from 'react';
import { formatNumber, quote } from '@utils/helpers';
import { useAppContext } from '@features/app-context';
import { useAppStore } from '@store/app-store';

export interface CalculateColumnSummaryProps {
  columnName: string | null;
  dataType: string;
}

export const useColumnSummary = () => {
  const { executeQuery } = useAppContext();
  const originalQuery = useAppStore((state) => state.originalQuery);

  const [columnTotal, setColumnTotal] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [columnDataType, setColumnDataType] = useState<string | null>(null);

  const isNumericType =
    columnDataType === 'bigint' || columnDataType === 'integer' || columnDataType === 'number';

  const calculateColumnSummary = async ({ columnName, dataType }: CalculateColumnSummaryProps) => {
    try {
      const isNumeric = dataType === 'bigint' || dataType === 'integer' || dataType === 'number';

      setColumnDataType(dataType);
      setColumnTotal(null);

      if (columnName === null) {
        setColumnTotal(null);
        return;
      }

      const summaryQuery = isNumeric
        ? `SELECT sum(${quote(columnName)}) AS total FROM (${originalQuery});`
        : `SELECT count(${quote(columnName)}) AS total FROM (${originalQuery});`;

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
