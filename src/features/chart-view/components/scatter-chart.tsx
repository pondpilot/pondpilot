import { ColorScheme } from '@models/chart';
import { useMemo } from 'react';
import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';

import { ChartDataPoint } from '../hooks/use-chart-data';
import { useChartTheme } from '../hooks/use-chart-theme';
import { getChartColorPalette, formatCompactNumber, formatTooltipNumber } from '../utils';

interface ScatterChartProps {
  data: ChartDataPoint[];
  yAxisColumn: string;
  title?: string | null;
  xAxisLabel?: string | null;
  yAxisLabel?: string | null;
  colorScheme?: ColorScheme;
}

/**
 * Scatter chart data format (x, y coordinates).
 */
type ScatterDataPoint = {
  x: number;
  y: number;
  name: string;
};

export function ScatterChart({
  data,
  yAxisColumn,
  title,
  xAxisLabel,
  yAxisLabel,
  colorScheme = 'default',
}: ScatterChartProps) {
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

  // Transform data for scatter chart format
  // For scatter, we need x,y coordinates - use index as x if names aren't numeric
  const scatterDataByKey = useMemo(() => {
    const result: Record<string, ScatterDataPoint[]> = {};

    for (const key of dataKeys) {
      result[key] = data.map((point, index) => {
        const xValue = parseFloat(point.name);
        const yValue = typeof point[key] === 'number' ? (point[key] as number) : 0;

        return {
          x: Number.isNaN(xValue) ? index : xValue,
          y: yValue,
          name: point.name,
        };
      });
    }

    return result;
  }, [data, dataKeys]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsScatterChart margin={{ top: title ? 40 : 20, right: 30, left: 20, bottom: 40 }}>
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
          dataKey="x"
          name="X"
          tick={{ fill: chartTheme.axis, fontSize: 11 }}
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
          type="number"
          dataKey="y"
          name="Y"
          tick={{ fill: chartTheme.axis, fontSize: 12 }}
          tickLine={{ stroke: chartTheme.axis }}
          axisLine={{ stroke: chartTheme.axis }}
          tickFormatter={formatCompactNumber}
          label={
            yAxisLabel
              ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fill: chartTheme.axis }
              : undefined
          }
        />
        <ZAxis range={[60, 60]} />
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
          formatter={(value: number, name: string) => [formatTooltipNumber(value), name]}
          labelFormatter={(_, payload) => {
            if (payload && payload.length > 0) {
              return `${(payload[0].payload as ScatterDataPoint).name}`;
            }
            return '';
          }}
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
          <Scatter key={key} name={key} data={scatterDataByKey[key]} fill={colors[index]} />
        ))}
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}
