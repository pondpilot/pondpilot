import { Box } from '@mantine/core';
import React from 'react';

import { ColumnMetadata, TableMetadata } from '../model';
import { isNumericColumnType } from '../utils/column-types';
import {
  StatsCardHeader,
  NumericStatsSection,
  CategoricalStatsSection,
  DistributionSection,
} from './column-stats-card/index';

interface ColumnStatsCardProps {
  column: ColumnMetadata;
  metadata: TableMetadata;
}

export const ColumnStatsCard = React.memo(({ column, metadata }: ColumnStatsCardProps) => {
  if (!column || !metadata) return null;

  const isNumeric = isNumericColumnType(column.type);

  return (
    <Box
      key={column.name}
      className="w-[240px] mr-4 rounded-xl border border-borderLight-light dark:border-borderLight-dark bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark overflow-hidden flex-shrink-0"
    >
      <StatsCardHeader
        columnName={column.name}
        columnType={column.type}
        distinctCount={column.distinctCount}
        error={column.error}
      />

      {isNumeric ? (
        <NumericStatsSection column={column} />
      ) : (
        <CategoricalStatsSection column={column} metadata={metadata} />
      )}

      <DistributionSection column={column} />
    </Box>
  );
});

ColumnStatsCard.displayName = 'ColumnStatsCard';
