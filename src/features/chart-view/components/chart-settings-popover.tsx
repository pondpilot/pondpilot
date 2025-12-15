import { ActionIcon, Menu, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  AggregationType,
  AGGREGATION_LABELS,
  ColorScheme,
  COLOR_SCHEME_LABELS,
  SortOrder,
  SORT_ORDER_LABELS,
} from '@models/chart';
import {
  IconMathFunction,
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconTextCaption,
} from '@tabler/icons-react';
import { useCallback, useState, useEffect } from 'react';

const AGGREGATION_OPTIONS: AggregationType[] = ['sum', 'avg', 'count', 'min', 'max'];

interface ChartSettingsPopoverProps {
  aggregation: AggregationType;
  sortBy: 'x' | 'y';
  sortOrder: SortOrder;
  title: string | null;
  xAxisLabel: string | null;
  yAxisLabel: string | null;
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  colorScheme: ColorScheme;
  onAggregationChange: (aggregation: AggregationType) => void;
  onSortChange: (sortBy: 'x' | 'y', sortOrder: SortOrder) => void;
  onTitleChange: (value: string | null) => void;
  onXAxisLabelChange: (value: string | null) => void;
  onYAxisLabelChange: (value: string | null) => void;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  disabled?: boolean;
}

/**
 * Chart settings controls including aggregation, sorting, labels, and color scheme.
 * Contains the aggregation menu, sort menu, and labels/settings popover.
 */
export function ChartSettingsPopover({
  aggregation,
  sortBy,
  sortOrder,
  title,
  xAxisLabel,
  yAxisLabel,
  xAxisColumn,
  yAxisColumn,
  colorScheme,
  onAggregationChange,
  onSortChange,
  onTitleChange,
  onXAxisLabelChange,
  onYAxisLabelChange,
  onColorSchemeChange,
  disabled,
}: ChartSettingsPopoverProps) {
  const [labelsMenuOpened, setLabelsMenuOpened] = useState(false);
  const [titleInput, setTitleInput] = useState(title ?? '');
  const [xAxisLabelInput, setXAxisLabelInput] = useState(xAxisLabel ?? '');
  const [yAxisLabelInput, setYAxisLabelInput] = useState(yAxisLabel ?? '');

  const [debouncedTitle] = useDebouncedValue(titleInput, 300);
  const [debouncedXAxisLabel] = useDebouncedValue(xAxisLabelInput, 300);
  const [debouncedYAxisLabel] = useDebouncedValue(yAxisLabelInput, 300);

  // Sync debounced values to callbacks
  useEffect(() => {
    onTitleChange(debouncedTitle || null);
  }, [debouncedTitle, onTitleChange]);

  useEffect(() => {
    onXAxisLabelChange(debouncedXAxisLabel || null);
  }, [debouncedXAxisLabel, onXAxisLabelChange]);

  useEffect(() => {
    onYAxisLabelChange(debouncedYAxisLabel || null);
  }, [debouncedYAxisLabel, onYAxisLabelChange]);

  // Sync prop changes back to local state when menu is closed
  useEffect(() => {
    if (!labelsMenuOpened) {
      setTitleInput(title ?? '');
      setXAxisLabelInput(xAxisLabel ?? '');
      setYAxisLabelInput(yAxisLabel ?? '');
    }
  }, [labelsMenuOpened, title, xAxisLabel, yAxisLabel]);

  const handleAggregationChange = useCallback(
    (agg: AggregationType) => {
      onAggregationChange(agg);
    },
    [onAggregationChange],
  );

  const handleSortChange = useCallback(
    (by: 'x' | 'y', order: SortOrder) => {
      onSortChange(by, order);
    },
    [onSortChange],
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitleInput(value);
    },
    [],
  );

  const handleXAxisLabelChange = useCallback(
    (value: string) => {
      setXAxisLabelInput(value);
    },
    [],
  );

  const handleYAxisLabelChange = useCallback(
    (value: string) => {
      setYAxisLabelInput(value);
    },
    [],
  );

  const handleColorSchemeChange = useCallback(
    (scheme: ColorScheme) => {
      onColorSchemeChange(scheme);
    },
    [onColorSchemeChange],
  );

  const getSortIcon = () => {
    if (sortOrder === 'asc') return <IconSortAscending size={16} />;
    if (sortOrder === 'desc') return <IconSortDescending size={16} />;
    return <IconArrowsSort size={16} />;
  };

  const colorSchemeOptions = (Object.keys(COLOR_SCHEME_LABELS) as ColorScheme[]).map((scheme) => ({
    value: scheme,
    label: COLOR_SCHEME_LABELS[scheme],
  }));

  const hasLabels = title || xAxisLabel || yAxisLabel;

  return (
    <>
      {/* Aggregation Menu */}
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip label={`Aggregation: ${AGGREGATION_LABELS[aggregation]}`} openDelay={400}>
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
              fw={aggregation === agg ? 600 : 400}
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
            label={`Sort: ${sortOrder === 'none' ? 'None' : `${sortBy === 'x' ? 'X' : 'Y'} ${SORT_ORDER_LABELS[sortOrder]}`}`}
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
            fw={sortOrder === 'none' ? 600 : 400}
          >
            Default order
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            onClick={() => handleSortChange('x', 'asc')}
            fw={sortBy === 'x' && sortOrder === 'asc' ? 600 : 400}
          >
            X-Axis ↑ (A→Z)
          </Menu.Item>
          <Menu.Item
            onClick={() => handleSortChange('x', 'desc')}
            fw={sortBy === 'x' && sortOrder === 'desc' ? 600 : 400}
          >
            X-Axis ↓ (Z→A)
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            onClick={() => handleSortChange('y', 'asc')}
            fw={sortBy === 'y' && sortOrder === 'asc' ? 600 : 400}
          >
            Y-Value ↑ (Low→High)
          </Menu.Item>
          <Menu.Item
            onClick={() => handleSortChange('y', 'desc')}
            fw={sortBy === 'y' && sortOrder === 'desc' ? 600 : 400}
          >
            Y-Value ↓ (High→Low)
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Labels/Title Menu */}
      <Menu
        shadow="md"
        position="bottom-start"
        withinPortal
        opened={labelsMenuOpened}
        onChange={setLabelsMenuOpened}
        closeOnItemClick={false}
      >
        <Menu.Target>
          <Tooltip label="Chart title & labels" openDelay={400}>
            <ActionIcon
              variant={hasLabels ? 'secondary' : 'transparent'}
              size="sm"
              onClick={() => setLabelsMenuOpened((o) => !o)}
              disabled={disabled}
            >
              <IconTextCaption size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Chart Labels</Menu.Label>
          <Stack gap="xs" className="w-56 px-2 pb-2">
            <div>
              <Menu.Label className="p-0 pb-1 text-xs">Chart title</Menu.Label>
              <TextInput
                placeholder="Enter title..."
                size="xs"
                value={titleInput}
                onChange={(e) => handleTitleChange(e.currentTarget.value)}
              />
            </div>
            <div>
              <Menu.Label className="p-0 pb-1 text-xs">X-axis label</Menu.Label>
              <TextInput
                placeholder={xAxisColumn ?? 'X-axis'}
                size="xs"
                value={xAxisLabelInput}
                onChange={(e) => handleXAxisLabelChange(e.currentTarget.value)}
              />
            </div>
            <div>
              <Menu.Label className="p-0 pb-1 text-xs">Y-axis label</Menu.Label>
              <TextInput
                placeholder={yAxisColumn ?? 'Y-axis'}
                size="xs"
                value={yAxisLabelInput}
                onChange={(e) => handleYAxisLabelChange(e.currentTarget.value)}
              />
            </div>
            <div>
              <Menu.Label className="p-0 pb-1 text-xs">Color scheme</Menu.Label>
              <Select
                size="xs"
                data={colorSchemeOptions}
                value={colorScheme}
                onChange={(value) => value && handleColorSchemeChange(value as ColorScheme)}
                comboboxProps={{ withinPortal: true, zIndex: 1001 }}
              />
            </div>
          </Stack>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
