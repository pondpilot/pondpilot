import { updateTabViewMode, updateTabChartConfig } from '@controllers/tab';
import { useChartData, useSmallMultiplesData } from '@features/chart-view';
import { Stack } from '@mantine/core';
import { ChartConfig, DEFAULT_CHART_CONFIG, DEFAULT_VIEW_MODE, ViewMode } from '@models/chart';
import { AnyFileSourceTab, TabId } from '@models/tab';
import { useAppStore, useTabReactiveState } from '@store/app-store';
import { memo, useCallback, useRef, useState } from 'react';

import { DataView, DataViewInfoPane } from '../components';
import { useDataAdapter } from '../hooks/use-data-adapter';

interface FileDataSourceTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const FileDataSourceTabView = memo(({ tabId, active }: FileDataSourceTabViewProps) => {
  // Get the reactive portion of tab state
  const tab = useTabReactiveState<AnyFileSourceTab>(tabId, 'data-source');

  // Get the data adapter
  const dataAdapter = useDataAdapter({ tab, sourceVersion: 0 });

  // View mode state (table/chart)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.viewMode ?? DEFAULT_VIEW_MODE,
  );

  // Chart configuration state
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => {
    const cached = useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.chartConfig;
    return cached ?? DEFAULT_CHART_CONFIG;
  });

  const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;
  const shouldFetchChartData = viewMode === 'chart' && !isSmallMultiplesMode;
  const chartDataResult = useChartData(dataAdapter, chartConfig, {
    enabled: shouldFetchChartData,
  });
  const smallMultiplesResult = useSmallMultiplesData(dataAdapter, chartConfig);

  // Ref for chart container (used for PNG export)
  const chartRef = useRef<HTMLDivElement>(null);

  // Handle view mode change
  const handleViewModeChange = useCallback(
    (newMode: ViewMode) => {
      setViewMode(newMode);
      updateTabViewMode(tabId, newMode);
    },
    [tabId],
  );

  // Handle chart config change
  const handleChartConfigChange = useCallback(
    (newConfig: Partial<ChartConfig>) => {
      setChartConfig((prev) => {
        const updated = { ...prev, ...newConfig };
        // Schedule store update after state is set to avoid side effects in updater
        queueMicrotask(() => updateTabChartConfig(tabId, updated));
        return updated;
      });
    },
    [tabId],
  );

  return (
    <Stack className="gap-0 h-full relative">
      <DataViewInfoPane
        dataAdapter={dataAdapter}
        tabType={tab.type}
        tabId={tab.id}
        viewMode={viewMode}
        chartConfig={chartConfig}
        onViewModeChange={handleViewModeChange}
        onChartConfigChange={handleChartConfigChange}
        chartRef={chartRef}
        xAxisCandidates={chartDataResult.xAxisCandidates}
        yAxisCandidates={chartDataResult.yAxisCandidates}
        groupByCandidates={chartDataResult.groupByCandidates}
        chartData={chartDataResult.chartData}
        pieChartData={chartDataResult.pieChartData}
        multiplesData={smallMultiplesResult.multiplesData}
      />
      <DataView
        active={active}
        dataAdapter={dataAdapter}
        tabId={tab.id}
        tabType={tab.type}
        viewMode={viewMode}
        chartConfig={chartConfig}
        onChartConfigChange={handleChartConfigChange}
        onViewModeChange={handleViewModeChange}
        chartRef={chartRef}
        chartDataResult={chartDataResult}
        smallMultiplesResult={smallMultiplesResult}
      />
    </Stack>
  );
});
