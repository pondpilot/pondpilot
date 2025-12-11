import { ActionIcon, Center, Group, Loader, Modal, Stack, Text, Tooltip } from '@mantine/core';
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
} from './components';
import { ChartDataPoint, PieChartDataPoint } from './hooks/use-chart-data';

interface ChartFullscreenModalProps {
  chartConfig: ChartConfig;
  chartData: ChartDataPoint[];
  pieChartData: PieChartDataPoint[];
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  onConfigChange: (config: Partial<ChartConfig>) => void;
}

export function ChartFullscreenModal({
  chartConfig,
  chartData,
  pieChartData,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onConfigChange,
}: ChartFullscreenModalProps) {
  const [opened, setOpened] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Delay chart rendering until modal is fully visible to allow ResponsiveContainer to measure correctly
  useEffect(() => {
    if (opened) {
      const timer = setTimeout(() => setIsReady(true), 50);
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
          body: { height: '100%' },
          content: { height: '100vh' },
        }}
      >
        <div className="h-full flex flex-col">
          <Group
            justify="space-between"
            wrap="nowrap"
            className="p-2 border-b border-borderPrimary-light dark:border-borderPrimary-dark flex-shrink-0"
          >
            <ChartConfigToolbar
              chartConfig={chartConfig}
              xAxisCandidates={xAxisCandidates}
              yAxisCandidates={yAxisCandidates}
              groupByCandidates={groupByCandidates}
              onConfigChange={onConfigChange}
            />
            <Tooltip label="Close fullscreen">
              <ActionIcon variant="transparent" size="md" onClick={() => setOpened(false)}>
                <IconX size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <div className="flex-1 min-h-0 h-full p-4">
            {isReady ? (
              renderChart()
            ) : (
              <Center className="h-full">
                <Stack align="center" gap="xs">
                  <Loader size="md" />
                  <Text size="sm" c="dimmed">
                    Loading chart...
                  </Text>
                </Stack>
              </Center>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
