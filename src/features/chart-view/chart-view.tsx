import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { ChartConfig, DEFAULT_CHART_CONFIG } from '@models/chart';
import { DataAdapterApi } from '@models/data-adapter';
import { IconChartBarOff, IconAlertCircle, IconNumber123, IconSettings } from '@tabler/icons-react';
import { forwardRef, lazy, Suspense, useEffect } from 'react';

import { ChartLoading } from './components';
import { useChartData, useSmallMultiplesData } from './hooks';

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
  dataAdapter: DataAdapterApi;
  chartConfig: ChartConfig | null;
  onConfigChange: (config: Partial<ChartConfig>) => void;
}

export const ChartView = forwardRef<HTMLDivElement, ChartViewProps>(
  ({ dataAdapter, chartConfig, onConfigChange }, ref) => {
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
      suggestedConfig,
    } = useChartData(dataAdapter, effectiveConfig, {
      // Skip fetching when in small multiples mode - that hook handles all Y columns
      enabled: !isSmallMultiplesMode,
    });

    // Small multiples data (only fetches when additionalYColumns is non-empty)
    const { multiplesData, isLoading: isSmallMultiplesLoading } = useSmallMultiplesData(
      dataAdapter,
      effectiveConfig,
    );

    // Auto-apply suggested config when columns change and no config is set
    useEffect(() => {
      if (!chartConfig && suggestedConfig.xAxisColumn && suggestedConfig.yAxisColumn) {
        onConfigChange(suggestedConfig);
      }
    }, [chartConfig, suggestedConfig, onConfigChange]);

    // Determine if we have valid configuration
    const hasValidConfig = effectiveConfig.xAxisColumn && effectiveConfig.yAxisColumn;
    const hasData = chartData.length > 0 || pieChartData.length > 0;
    const hasSmallMultiplesData = multiplesData.some((d) => d.data.length > 0);
    const hasNoNumericColumns = yAxisCandidates.length === 0;

    // Loading state (check both regular and small multiples loading)
    const isAnyLoading = isLoading || (isSmallMultiplesMode && isSmallMultiplesLoading);
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
    if (hasNoNumericColumns && xAxisCandidates.length > 0) {
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
          <Stack align="center" gap="sm">
            <ThemeIcon variant="light" color="blue" size="xl" radius="xl">
              <IconSettings size={24} />
            </ThemeIcon>
            <Text fw={500} size="sm">
              Configure your chart
            </Text>
            <Text c="dimmed" size="xs" maw={300} ta="center">
              Select X-axis and Y-axis columns from the toolbar above to create a visualization of
              your data.
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

    // Common props for all chart types
    const chartProps = {
      title: effectiveConfig.title,
      xAxisLabel: effectiveConfig.xAxisLabel,
      yAxisLabel: effectiveConfig.yAxisLabel,
      colorScheme: effectiveConfig.colorScheme,
    };

    // Render small multiples if in that mode
    if (isSmallMultiplesMode && hasSmallMultiplesData) {
      return (
        <div ref={ref} className="h-full w-full p-2 overflow-hidden">
          <Suspense fallback={<ChartLoading />}>
            <SmallMultiplesChart
              multiplesData={multiplesData}
              chartType={effectiveConfig.chartType}
              colorScheme={effectiveConfig.colorScheme}
              title={effectiveConfig.title}
            />
          </Suspense>
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
        <Suspense fallback={<ChartLoading />}>{renderChart()}</Suspense>
      </div>
    );
  },
);
