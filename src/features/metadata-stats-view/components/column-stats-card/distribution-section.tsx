import { Text } from '@mantine/core';
import React from 'react';

import { EXPANDED_CHART_HEIGHT, EXPANDED_CHART_WIDTH } from '../../constants';
import { ColumnMetadata } from '../../model';
import { isNumericColumnType } from '../../utils/column-types';
import { FrequencyDistribution } from '../frequency-distribution';
import { Histogram } from '../histogram';

interface DistributionSectionProps {
  column: ColumnMetadata;
}

export function DistributionSection({ column }: DistributionSectionProps) {
  const hasHistogram = column.histogram && column.histogram.length > 0;
  const hasFrequencyData =
    column.frequencyDistribution && Object.keys(column.frequencyDistribution).length > 0;

  if (!hasHistogram && !hasFrequencyData) {
    return null;
  }

  const isNumeric = isNumericColumnType(column.type);

  return (
    <div className="border-t border-borderLight-light dark:border-borderLight-dark">
      <div className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark px-3 py-2">
        <Text size="xs" c="text-secondary" fw={500}>
          Distribution
        </Text>
      </div>
      <div className="p-3">
        {isNumeric && hasHistogram ? (
          <Histogram
            data={column.histogram!}
            width={EXPANDED_CHART_WIDTH}
            height={EXPANDED_CHART_HEIGHT}
          />
        ) : hasFrequencyData ? (
          <FrequencyDistribution
            data={column.frequencyDistribution!}
            width={EXPANDED_CHART_WIDTH}
            height={120}
            maxItems={5}
          />
        ) : null}
      </div>
    </div>
  );
}
