import { ColorScheme } from '@models/chart';
import { useMemo } from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { ChartDataPoint } from '../hooks/use-chart-data';
import { useChartTheme } from '../hooks/use-chart-theme';
import { getChartColorPalette, formatCompactNumber, formatTooltipNumber } from '../utils';

interface HorizontalBarChartProps {
  data: ChartDataPoint[];
  yAxisColumn: string;
  title?: string | null;
  xAxisLabel?: string | null;
  yAxisLabel?: string | null;
  colorScheme?: ColorScheme;
}

export function HorizontalBarChart({
  data,
  yAxisColumn,
  title,
  xAxisLabel,
  yAxisLabel,
  colorScheme = 'default',
}: HorizontalBarChartProps) {
  const chartTheme = useChartTheme();

  // Get all data keys except 'name' for multi-series support
  const dataKeys = useMemo(() => {
    if (data.length === 0) return [yAxisColumn];

    const keys = new Set<string>();
    for (const point of data) {
      for (const key of Object.keys(point)) {
        if (key !== 'name') {
          keys.add(key);
        }
      }
    }
    return Array.from(keys);
  }, [data, yAxisColumn]);

  const colors = getChartColorPalette(dataKeys.length, colorScheme);

  // Truncate long Y-axis labels (category names in horizontal bar)
  const formatYAxisLabel = (value: string) => {
    const maxLength = 15;
    if (typeof value === 'string' && value.length > maxLength) {
      return `${value.substring(0, maxLength)}...`;
    }
    return value;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        layout="vertical"
        margin={{ top: title ? 40 : 20, right: 30, left: 80, bottom: 20 }}
      >
        {title && (
          <text
            x="50%"
            y={16}
            textAnchor="middle"
            fill={chartTheme.titleText}
            fontSize={14}
            fontWeight={500}
          >
            {title}
          </text>
        )}
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
        <XAxis
          type="number"
          tick={{ fill: chartTheme.axis, fontSize: 12 }}
          tickLine={{ stroke: chartTheme.axis }}
          axisLine={{ stroke: chartTheme.axis }}
          tickFormatter={formatCompactNumber}
          label={
            xAxisLabel
              ? { value: xAxisLabel, position: 'insideBottom', offset: -5, fill: chartTheme.axis }
              : undefined
          }
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: chartTheme.axis, fontSize: 11 }}
          tickLine={{ stroke: chartTheme.axis }}
          axisLine={{ stroke: chartTheme.axis }}
          width={70}
          tickFormatter={formatYAxisLabel}
          label={
            yAxisLabel
              ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fill: chartTheme.axis }
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: chartTheme.tooltipBg,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            borderRadius: '8px',
            boxShadow: chartTheme.isDark
              ? '0 4px 12px rgba(0, 0, 0, 0.4)'
              : '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
          labelStyle={{ color: chartTheme.tooltipText }}
          itemStyle={{ color: chartTheme.tooltipText }}
          formatter={(value: number | undefined, name: string | undefined) => [
            formatTooltipNumber(value ?? 0),
            name ?? '',
          ]}
        />
        {dataKeys.length > 1 && (
          <Legend
            wrapperStyle={{
              maxHeight: 60,
              overflowY: 'auto',
              overflowX: 'hidden',
              color: chartTheme.axis,
            }}
            formatter={(value: string) =>
              value.length > 20 ? `${value.substring(0, 20)}...` : value
            }
          />
        )}
        {dataKeys.map((key, index) => (
          <Bar key={key} dataKey={key} fill={colors[index]} radius={[0, 4, 4, 0]} />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
