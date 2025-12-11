import { ActionIcon, Group, Menu, Popover, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import {
  AggregationType,
  AGGREGATION_LABELS,
  ChartConfig,
  ChartType,
  ColorScheme,
  COLOR_SCHEME_LABELS,
  SortOrder,
  SORT_ORDER_LABELS,
} from '@models/chart';
import { DBColumn } from '@models/db';
import {
  IconChartBar,
  IconChartLine,
  IconChartDots3,
  IconChartPie,
  IconChartArea,
  IconChartAreaLine,
  IconLayoutRows,
  IconMathFunction,
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconTextCaption,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useCallback, useState } from 'react';

interface ChartConfigToolbarProps {
  chartConfig: ChartConfig;
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  onConfigChange: (config: Partial<ChartConfig>) => void;
  disabled?: boolean;
}

const CHART_TYPE_OPTIONS: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'bar', icon: <IconChartBar size={16} />, label: 'Bar' },
  { type: 'line', icon: <IconChartLine size={16} />, label: 'Line' },
  { type: 'area', icon: <IconChartArea size={16} />, label: 'Area' },
  { type: 'scatter', icon: <IconChartDots3 size={16} />, label: 'Scatter' },
  { type: 'pie', icon: <IconChartPie size={16} />, label: 'Pie' },
  { type: 'stacked-bar', icon: <IconChartAreaLine size={16} />, label: 'Stacked' },
  { type: 'horizontal-bar', icon: <IconLayoutRows size={16} />, label: 'Horizontal' },
];

const AGGREGATION_OPTIONS: AggregationType[] = ['sum', 'avg', 'count', 'min', 'max'];

export function ChartConfigToolbar({
  chartConfig,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onConfigChange,
  disabled,
}: ChartConfigToolbarProps) {
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

  // Labels popover state
  const [labelsPopoverOpened, setLabelsPopoverOpened] = useState(false);

  const handleTitleChange = useCallback(
    (value: string) => {
      onConfigChange({ title: value || null });
    },
    [onConfigChange],
  );

  const handleXAxisLabelChange = useCallback(
    (value: string) => {
      onConfigChange({ xAxisLabel: value || null });
    },
    [onConfigChange],
  );

  const handleYAxisLabelChange = useCallback(
    (value: string) => {
      onConfigChange({ yAxisLabel: value || null });
    },
    [onConfigChange],
  );

  const handleColorSchemeChange = useCallback(
    (scheme: ColorScheme) => {
      onConfigChange({ colorScheme: scheme });
    },
    [onConfigChange],
  );

  const colorSchemeOptions = (Object.keys(COLOR_SCHEME_LABELS) as ColorScheme[]).map((scheme) => ({
    value: scheme,
    label: COLOR_SCHEME_LABELS[scheme],
  }));

  const xAxisOptions = xAxisCandidates.map((col) => ({
    value: col.name,
    label: col.name,
  }));

  const yAxisOptions = yAxisCandidates.map((col) => ({
    value: col.name,
    label: col.name,
  }));

  const groupByOptions = groupByCandidates.map((col) => ({
    value: col.name,
    label: col.name,
  }));

  const getSortIcon = () => {
    if (chartConfig.sortOrder === 'asc') return <IconSortAscending size={16} />;
    if (chartConfig.sortOrder === 'desc') return <IconSortDescending size={16} />;
    return <IconArrowsSort size={16} />;
  };

  return (
    <Group gap="xs" wrap="nowrap">
      {/* Chart Type Icons */}
      <Group gap={2} wrap="nowrap">
        {CHART_TYPE_OPTIONS.map(({ type, icon, label }) => (
          <Tooltip key={type} label={label} openDelay={400}>
            <ActionIcon
              variant={chartConfig.chartType === type ? 'secondary' : 'transparent'}
              size="sm"
              onClick={() => handleChartTypeChange(type)}
              disabled={disabled}
              aria-label={label}
            >
              {icon}
            </ActionIcon>
          </Tooltip>
        ))}
      </Group>

      {/* Divider */}
      <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />

      {/* X-Axis Select */}
      <Select
        placeholder="X-Axis"
        data={xAxisOptions}
        value={chartConfig.xAxisColumn}
        onChange={handleXAxisChange}
        size="xs"
        clearable
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
        styles={{
          root: { minWidth: 100, maxWidth: 140 },
          input: { fontSize: 12 },
        }}
      />

      {/* Y-Axis Select */}
      <Select
        placeholder="Y-Axis"
        data={yAxisOptions}
        value={chartConfig.yAxisColumn}
        onChange={handleYAxisChange}
        size="xs"
        clearable
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
        styles={{
          root: { minWidth: 100, maxWidth: 140 },
          input: { fontSize: 12 },
        }}
      />

      {/* Group By Select (only for non-pie charts when options available) */}
      {chartConfig.chartType !== 'pie' && groupByOptions.length > 0 && (
        <Select
          placeholder="Group by"
          data={groupByOptions}
          value={chartConfig.groupByColumn}
          onChange={handleGroupByChange}
          size="xs"
          clearable
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: 1000 }}
          styles={{
            root: { minWidth: 100, maxWidth: 140 },
            input: { fontSize: 12 },
          }}
        />
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />

      {/* Aggregation Menu */}
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip
            label={`Aggregation: ${AGGREGATION_LABELS[chartConfig.aggregation]}`}
            openDelay={400}
          >
            <ActionIcon variant="transparent" size="sm" disabled={disabled}>
              <IconMathFunction size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Aggregation</Menu.Label>
          {AGGREGATION_OPTIONS.map((agg) => (
            <Menu.Item
              key={agg}
              onClick={() => handleAggregationChange(agg)}
              fw={chartConfig.aggregation === agg ? 600 : 400}
            >
              {AGGREGATION_LABELS[agg]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      {/* Sort Menu */}
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip
            label={`Sort: ${chartConfig.sortOrder === 'none' ? 'None' : `${chartConfig.sortBy === 'x' ? 'X' : 'Y'} ${SORT_ORDER_LABELS[chartConfig.sortOrder]}`}`}
            openDelay={400}
          >
            <ActionIcon variant="transparent" size="sm" disabled={disabled}>
              {getSortIcon()}
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Sort by</Menu.Label>
          <Menu.Item
            onClick={() => handleSortChange('x', 'none')}
            fw={chartConfig.sortOrder === 'none' ? 600 : 400}
          >
            Default order
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            onClick={() => handleSortChange('x', 'asc')}
            fw={chartConfig.sortBy === 'x' && chartConfig.sortOrder === 'asc' ? 600 : 400}
          >
            X-Axis ↑ (A→Z)
          </Menu.Item>
          <Menu.Item
            onClick={() => handleSortChange('x', 'desc')}
            fw={chartConfig.sortBy === 'x' && chartConfig.sortOrder === 'desc' ? 600 : 400}
          >
            X-Axis ↓ (Z→A)
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            onClick={() => handleSortChange('y', 'asc')}
            fw={chartConfig.sortBy === 'y' && chartConfig.sortOrder === 'asc' ? 600 : 400}
          >
            Y-Value ↑ (Low→High)
          </Menu.Item>
          <Menu.Item
            onClick={() => handleSortChange('y', 'desc')}
            fw={chartConfig.sortBy === 'y' && chartConfig.sortOrder === 'desc' ? 600 : 400}
          >
            Y-Value ↓ (High→Low)
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Labels/Title popover */}
      <Popover
        opened={labelsPopoverOpened}
        onChange={setLabelsPopoverOpened}
        position="bottom-start"
        shadow="md"
      >
        <Popover.Target>
          <Tooltip label="Chart title & labels" openDelay={400}>
            <ActionIcon
              variant={
                chartConfig.title || chartConfig.xAxisLabel || chartConfig.yAxisLabel
                  ? 'secondary'
                  : 'transparent'
              }
              size="sm"
              onClick={() => setLabelsPopoverOpened((o) => !o)}
            >
              <IconTextCaption size={16} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown
          className={cn(
            'min-w-32 border-0 bg-backgroundInverse-light dark:bg-backgroundInverse-dark rounded-lg',
          )}
        >
          <Stack gap="xs" className="w-56">
            <TextInput
              label="Chart title"
              placeholder="Enter title..."
              size="xs"
              value={chartConfig.title ?? ''}
              onChange={(e) => handleTitleChange(e.currentTarget.value)}
              classNames={{
                label: 'text-textContrast-light dark:text-textContrast-dark text-xs mb-1',
                input: cn(
                  'bg-backgroundInverse-light dark:bg-backgroundInverse-dark',
                  'text-textContrast-light dark:text-textContrast-dark',
                  'placeholder:text-iconDisabled-light dark:placeholder:text-iconDisabled-dark',
                  'border border-borderSecondary-light dark:border-borderSecondary-dark',
                  'focus:border-iconAccent-light dark:focus:border-iconAccent-dark',
                ),
              }}
            />
            <TextInput
              label="X-axis label"
              placeholder={chartConfig.xAxisColumn ?? 'X-axis'}
              size="xs"
              value={chartConfig.xAxisLabel ?? ''}
              onChange={(e) => handleXAxisLabelChange(e.currentTarget.value)}
              classNames={{
                label: 'text-textContrast-light dark:text-textContrast-dark text-xs mb-1',
                input: cn(
                  'bg-backgroundInverse-light dark:bg-backgroundInverse-dark',
                  'text-textContrast-light dark:text-textContrast-dark',
                  'placeholder:text-iconDisabled-light dark:placeholder:text-iconDisabled-dark',
                  'border border-borderSecondary-light dark:border-borderSecondary-dark',
                  'focus:border-iconAccent-light dark:focus:border-iconAccent-dark',
                ),
              }}
            />
            <TextInput
              label="Y-axis label"
              placeholder={chartConfig.yAxisColumn ?? 'Y-axis'}
              size="xs"
              value={chartConfig.yAxisLabel ?? ''}
              onChange={(e) => handleYAxisLabelChange(e.currentTarget.value)}
              classNames={{
                label: 'text-textContrast-light dark:text-textContrast-dark text-xs mb-1',
                input: cn(
                  'bg-backgroundInverse-light dark:bg-backgroundInverse-dark',
                  'text-textContrast-light dark:text-textContrast-dark',
                  'placeholder:text-iconDisabled-light dark:placeholder:text-iconDisabled-dark',
                  'border border-borderSecondary-light dark:border-borderSecondary-dark',
                  'focus:border-iconAccent-light dark:focus:border-iconAccent-dark',
                ),
              }}
            />
            <Select
              label="Color scheme"
              size="xs"
              data={colorSchemeOptions}
              value={chartConfig.colorScheme}
              onChange={(value) => value && handleColorSchemeChange(value as ColorScheme)}
              comboboxProps={{ withinPortal: true, zIndex: 1000 }}
              classNames={{
                label: 'text-textContrast-light dark:text-textContrast-dark text-xs mb-1',
                input: cn(
                  'bg-backgroundInverse-light dark:bg-backgroundInverse-dark',
                  'text-textContrast-light dark:text-textContrast-dark',
                  'border border-borderSecondary-light dark:border-borderSecondary-dark',
                ),
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
