import { Text, useMantineColorScheme } from '@mantine/core';
import React from 'react';

import { getChartColors } from '../../constants';

interface BooleanVisualizationProps {
  frequencyDistribution: Record<string, number>;
}

interface BooleanDistribution {
  truePercent: number;
  falsePercent: number;
  trueCount: number;
  falseCount: number;
}

export function BooleanVisualization({ frequencyDistribution }: BooleanVisualizationProps) {
  const { colorScheme } = useMantineColorScheme();
  const chartColors = getChartColors(colorScheme === 'dark');

  const getBooleanDistribution = (): BooleanDistribution | null => {
    const trueCount =
      frequencyDistribution.true || frequencyDistribution.True || frequencyDistribution['1'] || 0;
    const falseCount =
      frequencyDistribution.false || frequencyDistribution.False || frequencyDistribution['0'] || 0;
    const total = trueCount + falseCount;

    if (total === 0) return null;

    const truePercent = (trueCount / total) * 100;
    const falsePercent = (falseCount / total) * 100;

    return { truePercent, falsePercent, trueCount, falseCount };
  };

  const booleanDist = getBooleanDistribution();

  if (!booleanDist) {
    return null;
  }

  return (
    <div className="w-full relative">
      <div className="w-full rounded h-6 relative overflow-hidden flex">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${booleanDist.truePercent}%`,
            backgroundColor: chartColors.boolean.true,
          }}
        />
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${booleanDist.falsePercent}%`,
            backgroundColor: chartColors.boolean.false,
          }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text size="xs" className="font-medium" style={{ color: '#ffffff !important' }}>
          {booleanDist.truePercent.toFixed(1)}% true, {booleanDist.falsePercent.toFixed(1)}% false
        </Text>
      </div>
    </div>
  );
}
