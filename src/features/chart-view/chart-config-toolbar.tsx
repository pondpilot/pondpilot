import { Group } from '@mantine/core';
import { AggregationType, ChartConfig, ChartType, ColorScheme, SortOrder } from '@models/chart';
import { DBColumn } from '@models/db';
import { useCallback } from 'react';

import {
  ChartTypeSelector,
  ChartAxisControls,
  ChartSettingsPopover,
  ChartComparePopover,
} from './components';

interface ChartConfigToolbarProps {
  chartConfig: ChartConfig;
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  onConfigChange: (config: Partial<ChartConfig>) => void;
  disabled?: boolean;
}

/**
 * Toolbar for configuring chart visualization options.
 * Composed of smaller, focused sub-components for better maintainability.
 */
export function ChartConfigToolbar({
  chartConfig,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onConfigChange,
  disabled,
}: ChartConfigToolbarProps) {
  // Check if small multiples mode is active
  const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;

  // Conditions for showing toolbar elements
  const canShowGroupBy = chartConfig.chartType !== 'pie' && !isSmallMultiplesMode;
  const canShowSmallMultiples = chartConfig.chartType !== 'pie';

  // Event handlers
  const handleChartTypeChange = useCallback(
    (type: ChartType) => {
      onConfigChange({ chartType: type });
    },
    [onConfigChange],
  );

  const handleXAxisChange = useCallback(
    (value: string | null) => {
      onConfigChange({ xAxisColumn: value });
    },
    [onConfigChange],
  );

  const handleYAxisChange = useCallback(
    (value: string | null) => {
      onConfigChange({ yAxisColumn: value });
    },
    [onConfigChange],
  );

  const handleGroupByChange = useCallback(
    (value: string | null) => {
      onConfigChange({ groupByColumn: value });
    },
    [onConfigChange],
  );

  const handleAggregationChange = useCallback(
    (aggregation: AggregationType) => {
      onConfigChange({ aggregation });
    },
    [onConfigChange],
  );

  const handleSortChange = useCallback(
    (sortBy: 'x' | 'y', sortOrder: SortOrder) => {
      onConfigChange({ sortBy, sortOrder });
    },
    [onConfigChange],
  );

  const handleTitleChange = useCallback(
    (value: string | null) => {
      onConfigChange({ title: value });
    },
    [onConfigChange],
  );

  const handleXAxisLabelChange = useCallback(
    (value: string | null) => {
      onConfigChange({ xAxisLabel: value });
    },
    [onConfigChange],
  );

  const handleYAxisLabelChange = useCallback(
    (value: string | null) => {
      onConfigChange({ yAxisLabel: value });
    },
    [onConfigChange],
  );

  const handleColorSchemeChange = useCallback(
    (scheme: ColorScheme) => {
      onConfigChange({ colorScheme: scheme });
    },
    [onConfigChange],
  );

  const handleAdditionalYColumnsChange = useCallback(
    (columns: string[], clearGroupBy: boolean) => {
      onConfigChange({
        additionalYColumns: columns,
        groupByColumn: clearGroupBy ? null : chartConfig.groupByColumn,
      });
    },
    [onConfigChange, chartConfig.groupByColumn],
  );

  return (
    <Group gap="xs" wrap="nowrap">
      {/* Chart Type Selection */}
      <ChartTypeSelector
        chartType={chartConfig.chartType}
        onChartTypeChange={handleChartTypeChange}
        disabled={disabled}
      />

      {/* Divider */}
      <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />

      {/* Axis Controls */}
      <ChartAxisControls
        xAxisColumn={chartConfig.xAxisColumn}
        yAxisColumn={chartConfig.yAxisColumn}
        groupByColumn={chartConfig.groupByColumn}
        xAxisCandidates={xAxisCandidates}
        yAxisCandidates={yAxisCandidates}
        groupByCandidates={groupByCandidates}
        onXAxisChange={handleXAxisChange}
        onYAxisChange={handleYAxisChange}
        onGroupByChange={handleGroupByChange}
        showGroupBy={canShowGroupBy}
        disabled={disabled}
      />

      {/* Compare Metrics (Small Multiples) */}
      {canShowSmallMultiples && (
        <ChartComparePopover
          yAxisColumn={chartConfig.yAxisColumn}
          additionalYColumns={chartConfig.additionalYColumns}
          yAxisCandidates={yAxisCandidates}
          groupByColumn={chartConfig.groupByColumn}
          onAdditionalYColumnsChange={handleAdditionalYColumnsChange}
          disabled={disabled}
        />
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />

      {/* Settings (Aggregation, Sort, Labels, Colors) */}
      <ChartSettingsPopover
        aggregation={chartConfig.aggregation}
        sortBy={chartConfig.sortBy}
        sortOrder={chartConfig.sortOrder}
        title={chartConfig.title}
        xAxisLabel={chartConfig.xAxisLabel}
        yAxisLabel={chartConfig.yAxisLabel}
        xAxisColumn={chartConfig.xAxisColumn}
        yAxisColumn={chartConfig.yAxisColumn}
        colorScheme={chartConfig.colorScheme}
        onAggregationChange={handleAggregationChange}
        onSortChange={handleSortChange}
        onTitleChange={handleTitleChange}
        onXAxisLabelChange={handleXAxisLabelChange}
        onYAxisLabelChange={handleYAxisLabelChange}
        onColorSchemeChange={handleColorSchemeChange}
        disabled={disabled}
      />
    </Group>
  );
}
