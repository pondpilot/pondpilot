import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { ChartType, ColorScheme } from '@models/chart';
import { IconAlertCircle } from '@tabler/icons-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { SMALL_MULTIPLES_MIN_CHART_HEIGHT, X_AXIS_LABEL_MAX_LENGTH } from '../constants';
import { ChartDataPoint } from '../hooks/use-chart-data';
import { useChartTheme } from '../hooks/use-chart-theme';
import { SmallMultipleData } from '../hooks/use-small-multiples-data';
import { getChartColorPalette, formatCompactNumber, formatTooltipNumber } from '../utils';
import { ChartLoading } from './chart-loading';

interface SmallMultiplesChartProps {
  multiplesData: SmallMultipleData[];
  chartType: ChartType;
  colorScheme?: ColorScheme;
  title?: string | null;
}

interface SingleChartProps {
  data: ChartDataPoint[];
  yColumn: string;
  chartType: ChartType;
  colorScheme: ColorScheme;
  color: string;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Renders a single chart within the small multiples grid.
 * The first chart shows full X-axis labels, others show minimal tick marks.
 */
function SingleChart({ data, yColumn, chartType, color, isFirst, isLast }: SingleChartProps) {
  const chartTheme = useChartTheme();

  // Only show X-axis labels on the last chart
  const xAxisHeight = isLast ? 60 : 20;

  // Truncate long X-axis labels
  const formatXAxisLabel = (value: string) => {
    if (typeof value === 'string' && value.length > X_AXIS_LABEL_MAX_LENGTH) {
      return `${value.substring(0, X_AXIS_LABEL_MAX_LENGTH)}...`;
    }
    return value;
  };

  const commonXAxisProps = {
    dataKey: 'name',
    tick: isLast ? { fill: chartTheme.axis, fontSize: 10 } : false,
    tickLine: isLast ? { stroke: chartTheme.axis } : false,
    axisLine: { stroke: chartTheme.axis },
    height: xAxisHeight,
    angle: isLast ? -45 : 0,
    textAnchor: isLast ? ('end' as const) : ('middle' as const),
    interval: 'preserveStartEnd' as const,
    tickFormatter: isLast ? formatXAxisLabel : undefined,
  };

  const commonYAxisProps = {
    tick: { fill: chartTheme.axis, fontSize: 10 },
    tickLine: { stroke: chartTheme.axis },
    axisLine: { stroke: chartTheme.axis },
    tickFormatter: formatCompactNumber,
    width: 50,
  };

  const tooltipProps = {
    contentStyle: {
      backgroundColor: chartTheme.tooltipBg,
      border: `1px solid ${chartTheme.tooltipBorder}`,
      borderRadius: '8px',
      boxShadow: chartTheme.isDark
        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
        : '0 4px 12px rgba(0, 0, 0, 0.1)',
    },
    labelStyle: { color: chartTheme.tooltipText },
    itemStyle: { color: chartTheme.tooltipText },
    formatter: (value: number, name: string) =>
      [formatTooltipNumber(value), name] as [string, string],
  };

  // Tighter margins for stacked charts
  const margin = {
    top: isFirst ? 24 : 8,
    right: 16,
    left: 8,
    bottom: isLast ? 50 : 4,
  };

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...commonYAxisProps} />
            <Tooltip {...tooltipProps} />
            <Line
              type="monotone"
              dataKey={yColumn}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...commonYAxisProps} />
            <Tooltip {...tooltipProps} />
            <Area type="monotone" dataKey={yColumn} stroke={color} fill={color} fillOpacity={0.3} />
          </AreaChart>
        );

      case 'bar':
      default:
        return (
          <BarChart data={data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...commonYAxisProps} />
            <Tooltip {...tooltipProps} />
            <Bar dataKey={yColumn} fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="flex h-full w-full min-w-0" style={{ height: '100%' }}>
      <div className="flex items-center justify-center px-2">
        <div className="-rotate-90 text-xs whitespace-nowrap" style={{ color: chartTheme.axis }}>
          {yColumn}
        </div>
      </div>
      <div className="flex-1 h-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Small Multiples Chart - Renders multiple charts stacked vertically with synced X-axis.
 * Each chart shows a different Y metric at its own scale, enabling fair comparison
 * of metrics with different units or magnitudes.
 */
export function SmallMultiplesChart({
  multiplesData,
  chartType,
  colorScheme = 'default',
  title,
}: SmallMultiplesChartProps) {
  const chartTheme = useChartTheme();
  const colors = getChartColorPalette(multiplesData.length, colorScheme);

  // Filter out chart types that don't work well with small multiples
  const effectiveChartType = ['pie', 'scatter', 'stacked-bar', 'horizontal-bar'].includes(chartType)
    ? 'bar'
    : chartType;

  // Calculate height for each chart based on count
  const chartCount = multiplesData.length;

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      {/* Title */}
      {title && (
        <div
          className="text-center text-sm font-medium py-2"
          style={{ color: chartTheme.titleText }}
        >
          {title}
        </div>
      )}

      {/* Stacked charts container */}
      <div className="flex-1 flex flex-col gap-1 overflow-auto px-4 pb-2 min-h-0">
        {multiplesData.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === chartCount - 1;

          // Loading state for individual chart
          if (item.isLoading && item.data.length === 0) {
            return (
              <div
                key={item.yColumn}
                className="flex items-center justify-center min-w-0"
                style={{ minHeight: SMALL_MULTIPLES_MIN_CHART_HEIGHT }}
              >
                <ChartLoading message={`Loading ${item.yColumn}...`} size="sm" />
              </div>
            );
          }

          // Error state for individual chart
          if (item.error) {
            return (
              <div
                key={item.yColumn}
                className="flex items-center justify-center min-w-0"
                style={{ minHeight: SMALL_MULTIPLES_MIN_CHART_HEIGHT }}
              >
                <Center>
                  <Stack align="center" gap="xs">
                    <ThemeIcon variant="light" color="red" size="sm" radius="xl">
                      <IconAlertCircle size={14} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed">
                      {item.yColumn}: {item.error}
                    </Text>
                  </Stack>
                </Center>
              </div>
            );
          }

          // No data state
          if (item.data.length === 0) {
            return (
              <div
                key={item.yColumn}
                className="flex items-center justify-center min-w-0"
                style={{ minHeight: SMALL_MULTIPLES_MIN_CHART_HEIGHT }}
              >
                <Text size="xs" c="dimmed">
                  No data for {item.yColumn}
                </Text>
              </div>
            );
          }

          // Render the chart
          return (
            <div
              key={item.yColumn}
              className="flex-1 min-w-0"
              style={{ minHeight: SMALL_MULTIPLES_MIN_CHART_HEIGHT }}
            >
              <SingleChart
                data={item.data}
                yColumn={item.yColumn}
                chartType={effectiveChartType}
                colorScheme={colorScheme}
                color={colors[index]}
                isFirst={isFirst}
                isLast={isLast}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
