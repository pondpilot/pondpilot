import { ActionIcon, Group, Modal, Tooltip } from '@mantine/core';
import { ChartConfig } from '@models/chart';
import { DBColumn } from '@models/db';
import { IconArrowsMaximize, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { ChartConfigToolbar } from './chart-config-toolbar';
import {
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  AreaChart,
  StackedBarChart,
  HorizontalBarChart,
  SmallMultiplesChart,
  ChartLoading,
} from './components';
import { MODAL_CHART_RENDER_DELAY_MS } from './constants';
import { ChartDataPoint, PieChartDataPoint } from './hooks/use-chart-data';
import { SmallMultipleData } from './hooks/use-small-multiples-data';

interface ChartFullscreenModalProps {
  chartConfig: ChartConfig;
  chartData: ChartDataPoint[];
  pieChartData: PieChartDataPoint[];
  multiplesData: SmallMultipleData[];
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  onConfigChange: (config: Partial<ChartConfig>) => void;
}

export function ChartFullscreenModal({
  chartConfig,
  chartData,
  pieChartData,
  multiplesData,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onConfigChange,
}: ChartFullscreenModalProps) {
  const [opened, setOpened] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Check if in small multiples mode
  const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;
  const hasSmallMultiplesData = multiplesData.some((d) => d.data.length > 0);

  // Delay chart rendering until modal is fully visible to allow ResponsiveContainer to measure correctly
  useEffect(() => {
    if (opened) {
      // Delay ensures Modal transition is fully complete before rendering the chart.
      // Rendering during transition can cause ResponsiveContainer to calculate
      // 0 height/width or get stuck in a bad state.
      const timer = setTimeout(() => setIsReady(true), MODAL_CHART_RENDER_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [opened]);

  // Common props for all chart types
  const chartProps = {
    title: chartConfig.title,
    xAxisLabel: chartConfig.xAxisLabel,
    yAxisLabel: chartConfig.yAxisLabel,
    colorScheme: chartConfig.colorScheme,
  };

  const renderChart = () => {
    // Render small multiples if in that mode
    if (isSmallMultiplesMode && hasSmallMultiplesData) {
      return (
        <SmallMultiplesChart
          multiplesData={multiplesData}
          chartType={chartConfig.chartType}
          colorScheme={chartConfig.colorScheme}
          title={chartConfig.title}
        />
      );
    }

    switch (chartConfig.chartType) {
      case 'bar':
        return (
          <BarChart data={chartData} yAxisColumn={chartConfig.yAxisColumn ?? ''} {...chartProps} />
        );
      case 'line':
        return (
          <LineChart data={chartData} yAxisColumn={chartConfig.yAxisColumn ?? ''} {...chartProps} />
        );
      case 'scatter':
        return (
          <ScatterChart
            data={chartData}
            yAxisColumn={chartConfig.yAxisColumn ?? ''}
            {...chartProps}
          />
        );
      case 'pie':
        return (
          <PieChart
            data={pieChartData}
            title={chartConfig.title}
            colorScheme={chartConfig.colorScheme}
          />
        );
      case 'area':
        return (
          <AreaChart data={chartData} yAxisColumn={chartConfig.yAxisColumn ?? ''} {...chartProps} />
        );
      case 'stacked-bar':
        return (
          <StackedBarChart
            data={chartData}
            yAxisColumn={chartConfig.yAxisColumn ?? ''}
            {...chartProps}
          />
        );
      case 'horizontal-bar':
        return (
          <HorizontalBarChart
            data={chartData}
            yAxisColumn={chartConfig.yAxisColumn ?? ''}
            {...chartProps}
          />
        );
      default:
        return (
          <BarChart data={chartData} yAxisColumn={chartConfig.yAxisColumn ?? ''} {...chartProps} />
        );
    }
  };

  return (
    <>
      <Tooltip label="Fullscreen" openDelay={400}>
        <ActionIcon variant="transparent" size="sm" onClick={() => setOpened(true)}>
          <IconArrowsMaximize size={16} />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        fullScreen
        withCloseButton={false}
        padding={0}
        styles={{
          root: { height: '100vh' },
          inner: { height: '100vh' },
          content: { height: '100vh', display: 'flex', flexDirection: 'column' },
          body: { height: '100%', flex: 1, display: 'flex', flexDirection: 'column', padding: 0 },
        }}
      >
        <Group
          justify="space-between"
          wrap="nowrap"
          className="p-2 border-b border-borderPrimary-light dark:border-borderPrimary-dark"
          style={{ height: '52px', flexShrink: 0 }}
        >
          <ChartConfigToolbar
            chartConfig={chartConfig}
            xAxisCandidates={xAxisCandidates}
            yAxisCandidates={yAxisCandidates}
            groupByCandidates={groupByCandidates}
            onConfigChange={onConfigChange}
          />
          <Tooltip label="Close fullscreen" openDelay={400}>
            <ActionIcon variant="transparent" size="md" onClick={() => setOpened(false)}>
              <IconX size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div className="flex-1 overflow-hidden p-4">
          <div style={{ width: '100%', height: '100%' }}>
            {isReady ? renderChart() : <ChartLoading />}
          </div>
        </div>
      </Modal>
    </>
  );
}
