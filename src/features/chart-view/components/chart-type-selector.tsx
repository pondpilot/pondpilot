import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import { ChartType } from '@models/chart';
import {
  IconChartBar,
  IconChartLine,
  IconChartDots3,
  IconChartPie,
  IconChartArea,
  IconChartAreaLine,
  IconLayoutRows,
  IconDotsVertical,
} from '@tabler/icons-react';
import { useCallback } from 'react';

interface ChartTypeSelectorProps {
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  disabled?: boolean;
}

/** Primary chart types shown as direct icon buttons */
const PRIMARY_CHART_TYPES: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'bar', icon: <IconChartBar size={16} />, label: 'Bar' },
  { type: 'line', icon: <IconChartLine size={16} />, label: 'Line' },
  { type: 'area', icon: <IconChartArea size={16} />, label: 'Area' },
  { type: 'scatter', icon: <IconChartDots3 size={16} />, label: 'Scatter' },
  { type: 'pie', icon: <IconChartPie size={16} />, label: 'Pie' },
];

/** Secondary chart types shown in overflow menu */
const SECONDARY_CHART_TYPES: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'stacked-bar', icon: <IconChartAreaLine size={16} />, label: 'Stacked Bar' },
  { type: 'horizontal-bar', icon: <IconLayoutRows size={16} />, label: 'Horizontal Bar' },
];

/**
 * Chart type selector with primary icons and overflow menu for secondary types.
 * Primary types (Bar, Line, Area, Scatter, Pie) are shown as direct buttons.
 * Secondary types (Stacked Bar, Horizontal Bar) are in an overflow menu.
 */
export function ChartTypeSelector({
  chartType,
  onChartTypeChange,
  disabled,
}: ChartTypeSelectorProps) {
  const handleChartTypeChange = useCallback(
    (type: ChartType) => {
      onChartTypeChange(type);
    },
    [onChartTypeChange],
  );

  const isSecondaryTypeSelected = SECONDARY_CHART_TYPES.some((t) => t.type === chartType);

  return (
    <Group gap={2} wrap="nowrap">
      {PRIMARY_CHART_TYPES.map(({ type, icon, label }) => (
        <Tooltip key={type} label={label} openDelay={400}>
          <ActionIcon
            variant={chartType === type ? 'secondary' : 'transparent'}
            size="sm"
            onClick={() => handleChartTypeChange(type)}
            disabled={disabled}
            aria-label={label}
          >
            {icon}
          </ActionIcon>
        </Tooltip>
      ))}

      {/* Overflow menu for secondary chart types */}
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip label="More chart types" openDelay={400}>
            <ActionIcon
              variant={isSecondaryTypeSelected ? 'secondary' : 'transparent'}
              size="sm"
              disabled={disabled}
              aria-label="More chart types"
            >
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>More chart types</Menu.Label>
          {SECONDARY_CHART_TYPES.map(({ type, icon, label }) => (
            <Menu.Item
              key={type}
              leftSection={icon}
              onClick={() => handleChartTypeChange(type)}
              fw={chartType === type ? 600 : 400}
            >
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
