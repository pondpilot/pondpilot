import { useCallback, useState } from 'react';
import { formatNumber } from '@utils/helpers';
import { useAppContext } from '@features/app-context';
import { AnyTab } from '@models/tab';
import { NormalizedSQLType } from '@models/db';
import { isNumberType } from '@utils/db';

// TODO: remove. should become part of data adapter

export interface CalculateColumnSummaryProps {
  columnName: string | null;
  dataType: NormalizedSQLType;
}

export const useColumnSummary = (tab: AnyTab | undefined) => {
  const { executeQuery } = useAppContext();
  const [columnTotal, setColumnTotal] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [columnDataType, setColumnDataType] = useState<NormalizedSQLType | null>(null);

  const isNumericType = columnDataType ? isNumberType(columnDataType) : false;

  const calculateColumnSummary = async ({ columnName, dataType }: CalculateColumnSummaryProps) => {
    try {
      const isNumeric = dataType ? isNumberType(dataType) : false;

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
