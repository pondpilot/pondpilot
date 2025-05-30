import React from 'react';

import { StatsRow } from './stats-row';
import { ColumnMetadata } from '../../model';
import { safeDisplayNumericValue } from '../../utils/column-types';

interface NumericStatsSectionProps {
  column: ColumnMetadata;
}

export function NumericStatsSection({ column }: NumericStatsSectionProps) {
  return (
    <div>
      <StatsRow label="Min" value={safeDisplayNumericValue(column.min)} />
      <StatsRow label="Max" value={safeDisplayNumericValue(column.max)} />
      <StatsRow
        label="Mean"
        value={column.mean !== undefined ? safeDisplayNumericValue(column.mean) : 'N/A'}
      />
      <StatsRow
        label="Median"
        value={column.median !== undefined ? safeDisplayNumericValue(column.median) : 'N/A'}
      />
      <StatsRow
        label="Std Dev"
        value={column.stdDev !== undefined ? safeDisplayNumericValue(column.stdDev) : 'N/A'}
        isLast
      />
    </div>
  );
}
