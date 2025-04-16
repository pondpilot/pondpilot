import { Text } from '@mantine/core';
import { formatNumber } from '@utils/helpers';

interface ColRowCountProps {
  columnCount: number;
  rowCount: number;
  isEstimatedRowCount: boolean;
}
export const ColRowCount = ({ columnCount, rowCount, isEstimatedRowCount }: ColRowCountProps) => {
  return (
    <Text c="text-secondary" className="text-sm font-medium">
      {columnCount} columns, {formatNumber(rowCount)}
      {isEstimatedRowCount === null ? '+' : ''} {`row${rowCount > 1 ? 's' : ''}`}
    </Text>
  );
};
