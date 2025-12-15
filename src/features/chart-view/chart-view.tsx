import { Center, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ChartConfig, DEFAULT_CHART_CONFIG } from '@models/chart';
import { IconChartBarOff, IconAlertCircle, IconNumber123, IconSettings } from '@tabler/icons-react';
import { forwardRef, lazy, Suspense, useEffect, useMemo } from 'react';

import { ChartAxisControls, ChartErrorBoundary, ChartLoading } from './components';
import type { UseChartDataResult } from './hooks/use-chart-data';
import type { UseSmallMultiplesDataResult } from './hooks/use-small-multiples-data';

// Lazy load chart components to reduce initial bundle size
const BarChart = lazy(() =>
  import('./components/bar-chart').then((m) => ({ default: m.BarChart })),
);
const LineChart = lazy(() =>
  import('./components/line-chart').then((m) => ({ default: m.LineChart })),
);
const ScatterChart = lazy(() =>
  import('./components/scatter-chart').then((m) => ({ default: m.ScatterChart })),
);
const PieChart = lazy(() =>
  import('./components/pie-chart').then((m) => ({ default: m.PieChart })),
);
const AreaChart = lazy(() =>
  import('./components/area-chart').then((m) => ({ default: m.AreaChart })),
);
const StackedBarChart = lazy(() =>
  import('./components/stacked-bar-chart').then((m) => ({ default: m.StackedBarChart })),
);
const HorizontalBarChart = lazy(() =>
  import('./components/horizontal-bar-chart').then((m) => ({ default: m.HorizontalBarChart })),
);
const SmallMultiplesChart = lazy(() =>
  import('./components/small-multiples-chart').then((m) => ({ default: m.SmallMultiplesChart })),
);

interface ChartViewProps {
  chartConfig: ChartConfig | null;
  onConfigChange: (config: Partial<ChartConfig>) => void;
  chartDataResult: UseChartDataResult;
  smallMultiplesResult: UseSmallMultiplesDataResult;
}

export const ChartView = forwardRef<HTMLDivElement, ChartViewProps>(
  ({ chartConfig, onConfigChange, chartDataResult, smallMultiplesResult }, ref) => {
    const effectiveConfig = chartConfig ?? DEFAULT_CHART_CONFIG;

    // Determine small multiples mode before hooks to avoid duplicate queries
    const isSmallMultiplesMode = effectiveConfig.additionalYColumns.length > 0;

    const {
      chartData,
      pieChartData,
      isLoading,
      error,
      xAxisCandidates,
      yAxisCandidates,
      groupByCandidates,
      suggestedConfig,
    } = chartDataResult;

    const { multiplesData, isLoading: isSmallMultiplesLoading } = smallMultiplesResult;

    // Auto-apply suggested config when columns change and no config is set
    useEffect(() => {
      if (!chartConfig && suggestedConfig.xAxisColumn && suggestedConfig.yAxisColumn) {
        onConfigChange(suggestedConfig);
      }
    }, [chartConfig, suggestedConfig, onConfigChange]);

    // Memoize computed display conditions to avoid recalculation on every render
    const displayConditions = useMemo(
      () => ({
        hasValidConfig: Boolean(effectiveConfig.xAxisColumn && effectiveConfig.yAxisColumn),
        hasData: chartData.length > 0 || pieChartData.length > 0,
        hasSmallMultiplesData: multiplesData.some((d) => d.data.length > 0),
        hasNoNumericColumns: yAxisCandidates.length === 0,
        hasXAxisCandidates: xAxisCandidates.length > 0,
        isAnyLoading: isLoading || (isSmallMultiplesMode && isSmallMultiplesLoading),
      }),
      [
        effectiveConfig.xAxisColumn,
        effectiveConfig.yAxisColumn,
        chartData.length,
        pieChartData.length,
        multiplesData,
        yAxisCandidates.length,
        xAxisCandidates.length,
        isLoading,
        isSmallMultiplesMode,
        isSmallMultiplesLoading,
      ],
    );

    // Memoize common props for all chart types (must be before any early returns)
    const chartProps = useMemo(
      () => ({
        title: effectiveConfig.title,
        xAxisLabel: effectiveConfig.xAxisLabel,
        yAxisLabel: effectiveConfig.yAxisLabel,
        colorScheme: effectiveConfig.colorScheme,
      }),
      [
        effectiveConfig.title,
        effectiveConfig.xAxisLabel,
        effectiveConfig.yAxisLabel,
        effectiveConfig.colorScheme,
      ],
    );

    const {
      hasValidConfig,
      hasData,
      hasSmallMultiplesData,
      hasNoNumericColumns,
      hasXAxisCandidates,
      isAnyLoading,
    } = displayConditions;
    if (isAnyLoading) {
      return <ChartLoading message="Loading chart data..." />;
    }

    // Error state
    if (error) {
      return (
        <Center className="h-full">
          <Stack align="center" gap="sm">
            <ThemeIcon variant="light" color="red" size="xl" radius="xl">
              <IconAlertCircle size={24} />
            </ThemeIcon>
            <Text fw={500} size="sm">
              Error loading chart data
            </Text>
            <Text c="dimmed" size="xs" maw={300} ta="center">
              {error}
            </Text>
          </Stack>
        </Center>
      );
    }

    // No numeric columns available
    if (hasNoNumericColumns && hasXAxisCandidates) {
      return (
        <Center className="h-full">
          <Stack align="center" gap="sm">
            <ThemeIcon variant="light" color="orange" size="xl" radius="xl">
              <IconNumber123 size={24} />
            </ThemeIcon>
            <Text fw={500} size="sm">
              No numeric columns available
            </Text>
            <Text c="dimmed" size="xs" maw={300} ta="center">
              Charts require at least one numeric column for the Y-axis. Your data only contains
              text, dates, or other non-numeric types.
            </Text>
          </Stack>
        </Center>
      );
    }

    // No data available - needs configuration
    if (!hasData && !hasValidConfig) {
      return (
        <Center className="h-full">
          <Stack align="center" gap="md">
            <ThemeIcon variant="light" color="background-accent" size="xl" radius="xl">
              <IconSettings size={24} />
            </ThemeIcon>
            <Title order={3}>Configure your chart</Title>

            <Group gap="xs">
              <ChartAxisControls
                xAxisColumn={effectiveConfig.xAxisColumn}
                yAxisColumn={effectiveConfig.yAxisColumn}
                groupByColumn={effectiveConfig.groupByColumn}
                xAxisCandidates={xAxisCandidates}
                yAxisCandidates={yAxisCandidates}
                groupByCandidates={groupByCandidates}
                onXAxisChange={(value) => onConfigChange({ xAxisColumn: value })}
                onYAxisChange={(value) => onConfigChange({ yAxisColumn: value })}
                onGroupByChange={(value) => onConfigChange({ groupByColumn: value })}
                showGroupBy={effectiveConfig.chartType !== 'pie'}
                disabled={false}
              />
            </Group>

            <Text c="dimmed" size="xs" maw={350} ta="center">
              Select columns above to create your visualization
            </Text>
          </Stack>
        </Center>
      );
    }

    // No data after configuration (unless we have small multiples data)
    if (!hasData && !hasSmallMultiplesData && hasValidConfig) {
      return (
        <Center className="h-full">
          <Stack align="center" gap="sm">
            <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
              <IconChartBarOff size={24} />
            </ThemeIcon>
            <Text fw={500} size="sm">
              No data to display
            </Text>
            <Text c="dimmed" size="xs" maw={300} ta="center">
              Run a query or load data to see your chart. The chart will update automatically when
              data is available.
            </Text>
          </Stack>
        </Center>
      );
    }

    // Render small multiples if in that mode
    if (isSmallMultiplesMode && hasSmallMultiplesData) {
      return (
        <div ref={ref} className="h-full w-full p-2 overflow-hidden">
          <ChartErrorBoundary>
            <Suspense fallback={<ChartLoading />}>
              <SmallMultiplesChart
                multiplesData={multiplesData}
                chartType={effectiveConfig.chartType}
                colorScheme={effectiveConfig.colorScheme}
                title={effectiveConfig.title}
              />
            </Suspense>
          </ChartErrorBoundary>
        </div>
      );
    }

    // Render the appropriate chart type
    const renderChart = () => {
      switch (effectiveConfig.chartType) {
        case 'bar':
          return (
            <BarChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        case 'line':
          return (
            <LineChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        case 'scatter':
          return (
            <ScatterChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        case 'pie':
          return (
            <PieChart
              data={pieChartData}
              title={effectiveConfig.title}
              colorScheme={effectiveConfig.colorScheme}
            />
          );
        case 'area':
          return (
            <AreaChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        case 'stacked-bar':
          return (
            <StackedBarChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        case 'horizontal-bar':
          return (
            <HorizontalBarChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
        default:
          return (
            <BarChart
              data={chartData}
              yAxisColumn={effectiveConfig.yAxisColumn ?? ''}
              {...chartProps}
            />
          );
      }
    };

    return (
      <div ref={ref} className="h-full w-full p-2 overflow-hidden">
        <ChartErrorBoundary>
          <Suspense fallback={<ChartLoading />}>{renderChart()}</Suspense>
        </ChartErrorBoundary>
      </div>
    );
  },
);
