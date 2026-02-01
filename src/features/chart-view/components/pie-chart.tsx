import { ColorScheme } from '@models/chart';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { PieChartDataPoint } from '../hooks/use-chart-data';
import { useChartTheme } from '../hooks/use-chart-theme';
import { getChartColorPalette, formatTooltipNumber } from '../utils';

interface PieChartProps {
  data: PieChartDataPoint[];
  title?: string | null;
  colorScheme?: ColorScheme;
}

export function PieChart({ data, title, colorScheme = 'default' }: PieChartProps) {
  const chartTheme = useChartTheme();

  const colors = getChartColorPalette(data.length, colorScheme);

  // Custom label renderer
  const renderLabel = (props: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    innerRadius?: number;
    outerRadius?: number;
    percent?: number;
  }) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;

    // Guard against undefined values
    if (
      cx === undefined ||
      cy === undefined ||
      midAngle === undefined ||
      innerRadius === undefined ||
      outerRadius === undefined ||
      percent === undefined
    ) {
      return null;
    }

    // Only show label if segment is large enough (> 5%)
    if (percent < 0.05) return null;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart margin={{ top: title ? 30 : 10, right: 0, bottom: 0, left: 0 }}>
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
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderLabel}
          outerRadius="80%"
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index]} />
          ))}
        </Pie>
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
          formatter={(value: number | undefined) => [formatTooltipNumber(value ?? 0), 'Value'] as [string, string]}
        />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          wrapperStyle={{
            paddingLeft: 20,
            maxHeight: 200,
            overflowY: 'auto',
            overflowX: 'hidden',
            color: chartTheme.axis,
          }}
          formatter={(value: string) =>
            value.length > 25 ? `${value.substring(0, 25)}...` : value
          }
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
