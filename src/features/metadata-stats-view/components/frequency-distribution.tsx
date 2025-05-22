import { Box, Text, useMantineColorScheme } from '@mantine/core';
import React, { useMemo } from 'react';

import {
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_FREQUENCY_HEIGHT,
  DEFAULT_MAX_FREQUENCY_ITEMS,
  MAX_LABEL_LENGTH,
  DEFAULT_OPACITY,
  getChartColors,
} from '../constants';
import { useContainerResize } from '../hooks';
import { sanitizeDisplayValue } from '../utils/column-types';

interface FrequencyDistributionProps {
  data: Record<string, number>;
  width?: number | string;
  height?: number;
  maxItems?: number;
}

export const FrequencyDistribution = React.memo(
  ({
    data,
    width = '100%',
    height = DEFAULT_FREQUENCY_HEIGHT,
    maxItems = DEFAULT_MAX_FREQUENCY_ITEMS,
  }: FrequencyDistributionProps) => {
    const { containerRef, containerWidth } = useContainerResize();
    const { colorScheme } = useMantineColorScheme();
    const chartColors = getChartColors(colorScheme === 'dark');

    const processedData = useMemo(() => {
      // Validate input data
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return { isValid: false, error: 'No frequency data available' };
      }

      try {
        const entries = Object.entries(data)
          .filter(([key, value]) => {
            // Validate each entry
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
              console.warn(`Invalid frequency value for "${key}": ${value}`);
              return false;
            }
            return true;
          })
          .sort((a, b) => b[1] - a[1])
          .slice(0, Math.max(1, maxItems)); // Ensure at least 1 item

        if (entries.length === 0) {
          return { isValid: false, error: 'No valid frequency data' };
        }

        const maxFrequency = Math.max(...entries.map(([_, count]) => count));
        if (!Number.isFinite(maxFrequency) || maxFrequency <= 0) {
          return { isValid: false, error: 'Invalid frequency values' };
        }

        return { isValid: true, entries, maxFrequency };
      } catch (error) {
        return { isValid: false, error: 'Error processing frequency data' };
      }
    }, [data, maxItems]);

    const viewBoxWidth = useMemo(
      () => Math.max(DEFAULT_CONTAINER_WIDTH, containerWidth),
      [containerWidth],
    );

    if (!processedData.isValid) {
      return (
        <Text size="sm" c="text-secondary">
          {processedData.error}
        </Text>
      );
    }

    const { entries, maxFrequency } = processedData;

    return (
      <Box ref={containerRef} style={{ width, height }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Frequency distribution chart showing ${entries?.length || 0} items`}
        >
          {entries?.map(([value, count], i) => {
            try {
              const barHeight = height / (entries?.length || 1);
              const barWidth = (count / (maxFrequency || 1)) * viewBoxWidth * 0.65; // Leave space for labels
              const y = i * barHeight;

              // Validate calculated values
              if (
                !Number.isFinite(barHeight) ||
                !Number.isFinite(barWidth) ||
                !Number.isFinite(y)
              ) {
                console.warn(`Invalid bar calculations for item ${i}:`, { barHeight, barWidth, y });
                return null;
              }

              const sanitizedValue = sanitizeDisplayValue(value);
              const displayValue =
                sanitizedValue.length > MAX_LABEL_LENGTH + 2
                  ? `${sanitizedValue.substring(0, MAX_LABEL_LENGTH)}...`
                  : sanitizedValue;

              return (
                <g key={`${value}-${i}`}>
                  <rect
                    x={0}
                    y={Math.max(0, y + 2)}
                    width={Math.max(0, barWidth)}
                    height={Math.max(0, barHeight - 4)}
                    fill={chartColors.frequency}
                    className="hover:opacity-100 transition-opacity duration-200"
                    style={{ opacity: DEFAULT_OPACITY / 100 }}
                    aria-label={`${sanitizedValue}: ${count} occurrences`}
                    role="graphics-symbol"
                  />
                  <text
                    x={barWidth + 5}
                    y={y + barHeight / 2 + 5}
                    fontSize="12"
                    className="fill-current text-text-primary"
                  >
                    {displayValue}: {count}
                  </text>
                </g>
              );
            } catch (error) {
              console.warn(`Error rendering frequency bar ${i}:`, error);
              return null;
            }
          })}
        </svg>
      </Box>
    );
  },
);
