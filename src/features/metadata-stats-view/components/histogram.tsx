import { Box, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import React, { useState, useMemo } from 'react';

import {
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_HISTOGRAM_HEIGHT,
  CHART_PADDING,
  DEFAULT_OPACITY,
  HOVER_OPACITY,
  getChartColors,
  MIN_BAR_WIDTH,
  MIN_BAR_HEIGHT,
  BAR_SPACING,
  GRID_LINE_WIDTH,
  GRID_OFFSET,
  CHART_TRANSITION_DURATION,
} from '../constants';
import { useContainerResize } from '../hooks';
import { sanitizeDisplayValue, safeFormatChartValue } from '../utils/column-types';

interface HistogramProps {
  data: { bin: number; frequency: number }[];
  width?: number | string;
  height?: number;
}

export const Histogram = React.memo(
  ({ data, width = '100%', height = DEFAULT_HISTOGRAM_HEIGHT }: HistogramProps) => {
    const { containerRef, containerWidth } = useContainerResize();
    const [hoveredBar, setHoveredBar] = useState<number | null>(null);
    const { colorScheme } = useMantineColorScheme();
    const chartColors = getChartColors(colorScheme === 'dark');

    const processedData = useMemo(() => {
      // Validate input data
      if (!data || !Array.isArray(data) || data.length === 0) {
        return { isValid: false, error: 'No histogram data available' };
      }

      // Validate data structure
      const hasValidData = data.every(
        (d) =>
          typeof d === 'object' &&
          d !== null &&
          typeof d.bin === 'number' &&
          typeof d.frequency === 'number' &&
          Number.isFinite(d.frequency) &&
          d.frequency >= 0,
      );

      if (!hasValidData) {
        return { isValid: false, error: 'Invalid histogram data' };
      }

      try {
        const maxFrequency = Math.max(...data.map((d) => d.frequency));
        if (!Number.isFinite(maxFrequency) || maxFrequency < 0) {
          return { isValid: false, error: 'Invalid frequency values' };
        }

        return { isValid: true, maxFrequency };
      } catch (error) {
        return { isValid: false, error: 'Error processing histogram data' };
      }
    }, [data]);

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

    const { maxFrequency } = processedData;

    return (
      <Box ref={containerRef} style={{ width, height }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Histogram showing frequency distribution across ${data.length} bins`}
        >
          {data.map((d, i) => {
            try {
              const barWidth = viewBoxWidth / data.length;
              const barHeight = (d.frequency / (maxFrequency || 1)) * (height - CHART_PADDING);
              const x = i * barWidth;
              const y = height - barHeight - GRID_OFFSET;

              // Validate calculated values
              if (
                !Number.isFinite(barWidth) ||
                !Number.isFinite(barHeight) ||
                !Number.isFinite(x) ||
                !Number.isFinite(y)
              ) {
                console.warn(`Invalid bar calculations for bin ${i}:`, {
                  barWidth,
                  barHeight,
                  x,
                  y,
                });
                return null;
              }

              const rangeStart = safeFormatChartValue(d.bin) ?? '0';
              const firstBin = data[0]?.bin || 0;
              const secondBin = data[1]?.bin || 1;
              const binStep = secondBin - firstBin;
              const rangeEndValue = d.bin + binStep;
              const rangeEnd = safeFormatChartValue(rangeEndValue) ?? '1';
              const frequency = safeFormatChartValue(d.frequency) ?? '0';
              const tooltipContent = `Range: ${sanitizeDisplayValue(rangeStart)} - ${sanitizeDisplayValue(rangeEnd)}\nFrequency: ${sanitizeDisplayValue(frequency)}`;

              return (
                <g key={i}>
                  <Tooltip
                    label={tooltipContent}
                    position="top"
                    withArrow
                    multiline
                    opened={hoveredBar === i}
                  >
                    <rect
                      x={x + BAR_SPACING}
                      y={Math.max(MIN_BAR_HEIGHT, y)}
                      width={Math.max(MIN_BAR_WIDTH, barWidth - BAR_SPACING * 2)}
                      height={Math.max(MIN_BAR_HEIGHT, barHeight)}
                      fill={chartColors.histogram}
                      className={`transition-opacity duration-${CHART_TRANSITION_DURATION} cursor-pointer`}
                      style={{
                        opacity: hoveredBar === i ? HOVER_OPACITY / 100 : DEFAULT_OPACITY / 100,
                      }}
                      onMouseEnter={() => setHoveredBar(i)}
                      onMouseLeave={() => setHoveredBar(null)}
                      aria-label={`Bin ${i + 1}: ${rangeStart} to ${rangeEnd}, frequency ${frequency}`}
                      role="graphics-symbol"
                    />
                  </Tooltip>
                  {/* Add subtle grid line */}
                  {i === 0 && (
                    <line
                      x1={0}
                      y1={height - GRID_OFFSET}
                      x2={viewBoxWidth}
                      y2={height - GRID_OFFSET}
                      stroke={chartColors.gridLine}
                      strokeWidth={GRID_LINE_WIDTH}
                    />
                  )}
                </g>
              );
            } catch (error) {
              console.warn(`Error rendering histogram bar ${i}:`, error);
              return null;
            }
          })}
        </svg>
      </Box>
    );
  },
);
