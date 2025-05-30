import { Text, useMantineColorScheme } from '@mantine/core';
import React from 'react';

import { getChartColors } from '../../constants';

interface DistinctnessBarProps {
  distinctCount: number;
  totalRows: number;
}

export function DistinctnessBar({ distinctCount, totalRows }: DistinctnessBarProps) {
  const { colorScheme } = useMantineColorScheme();
  const chartColors = getChartColors(colorScheme === 'dark');
  const countDistinctPercent =
    distinctCount && totalRows ? ((distinctCount / totalRows) * 100).toFixed(1) : '0';

  return (
    <div className="w-full relative">
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-6 relative overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.min(parseFloat(countDistinctPercent), 100)}%`,
            backgroundColor: chartColors.distinct,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Text size="xs" className="font-medium" style={{ color: '#ffffff !important' }}>
            {countDistinctPercent}% unique
          </Text>
        </div>
      </div>
    </div>
  );
}
