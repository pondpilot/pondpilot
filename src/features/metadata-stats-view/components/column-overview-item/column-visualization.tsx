import React from 'react';

import { BooleanVisualization } from './boolean-visualization';
import { DistinctnessBar } from './distinctness-bar';
import { COMPACT_CHART_HEIGHT, COMPACT_MAX_FREQUENCY_ITEMS } from '../../constants';
import { ColumnMetadata } from '../../model';
import { shouldShowHistogram, isBooleanColumnType } from '../../utils/column-types';
import { FrequencyDistribution } from '../frequency-distribution';
import { Histogram } from '../histogram';

interface ColumnVisualizationProps {
  column: ColumnMetadata;
  totalRows: number;
}

export function ColumnVisualization({ column, totalRows }: ColumnVisualizationProps) {
  const showHistogram = shouldShowHistogram(column.type);
  const isBoolean = isBooleanColumnType(column.type);

  if (isBoolean && column.frequencyDistribution) {
    return <BooleanVisualization frequencyDistribution={column.frequencyDistribution} />;
  }

  if (showHistogram && (column.histogram || column.frequencyDistribution)) {
    if (column.histogram) {
      return <Histogram data={column.histogram} height={COMPACT_CHART_HEIGHT} />;
    }
    if (column.frequencyDistribution) {
      return (
        <FrequencyDistribution
          data={column.frequencyDistribution}
          maxItems={COMPACT_MAX_FREQUENCY_ITEMS}
        />
      );
    }
  }

  return <DistinctnessBar distinctCount={column.distinctCount} totalRows={totalRows} />;
}
