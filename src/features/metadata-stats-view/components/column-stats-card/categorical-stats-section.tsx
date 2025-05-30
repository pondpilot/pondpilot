import React from 'react';

import { StatsRow } from './stats-row';
import { ColumnMetadata, TableMetadata } from '../../model';

interface CategoricalStatsSectionProps {
  column: ColumnMetadata;
  metadata: TableMetadata;
}

export function CategoricalStatsSection({ column, metadata }: CategoricalStatsSectionProps) {
  const nonNullPercentage = metadata.rowCount
    ? ((column.nonNullCount / metadata.rowCount) * 100).toFixed(1)
    : 0;

  const distinctnessPercentage = column.nonNullCount
    ? ((column.distinctCount / column.nonNullCount) * 100).toFixed(1)
    : 0;

  return (
    <div>
      <StatsRow
        label="Non-null Count"
        value={`${column.nonNullCount} / ${metadata.rowCount} (${nonNullPercentage}%)`}
      />
      <StatsRow
        label="Distinct"
        value={`${column.distinctCount} (${distinctnessPercentage}%)`}
        isLast
      />
    </div>
  );
}
