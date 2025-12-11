import { ActionIcon, Menu, MultiSelect, Stack, Tooltip } from '@mantine/core';
import { DBColumn } from '@models/db';
import { IconStack2 } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';

import { MAX_SMALL_MULTIPLES_COLUMNS } from '../constants';

interface ChartComparePopoverProps {
  yAxisColumn: string | null;
  additionalYColumns: string[];
  yAxisCandidates: DBColumn[];
  groupByColumn: string | null;
  onAdditionalYColumnsChange: (columns: string[], clearGroupBy: boolean) => void;
  disabled?: boolean;
}

/**
 * Compare metrics popover for small multiples configuration.
 * Allows selecting additional Y columns to compare in separate charts.
 */
export function ChartComparePopover({
  yAxisColumn,
  additionalYColumns,
  yAxisCandidates,
  groupByColumn,
  onAdditionalYColumnsChange,
  disabled,
}: ChartComparePopoverProps) {
  const [menuOpened, setMenuOpened] = useState(false);

  const isSmallMultiplesMode = additionalYColumns.length > 0;

  // Filter Y-axis options to exclude the primary Y column
  const additionalYColumnOptions = useMemo(
    () => yAxisCandidates.filter((col) => col.name !== yAxisColumn),
    [yAxisCandidates, yAxisColumn],
  );

  // Validate that selected columns still exist in available options
  const validatedAdditionalYColumns = useMemo(() => {
    const availableNames = new Set(additionalYColumnOptions.map((col) => col.name));
    return additionalYColumns.filter((col) => availableNames.has(col));
  }, [additionalYColumns, additionalYColumnOptions]);

  const handleAdditionalYColumnsChange = useCallback(
    (values: string[]) => {
      // Validate that selected columns exist in available options
      const availableNames = new Set(additionalYColumnOptions.map((col) => col.name));
      const validValues = values.filter((col) => availableNames.has(col));

      // When adding additional columns, clear groupBy (they're mutually exclusive)
      const shouldClearGroupBy = validValues.length > 0 && groupByColumn !== null;
      onAdditionalYColumnsChange(validValues, shouldClearGroupBy);
    },
    [onAdditionalYColumnsChange, groupByColumn, additionalYColumnOptions],
  );

  const selectOptions = useMemo(
    () => additionalYColumnOptions.map((col) => ({ value: col.name, label: col.name })),
    [additionalYColumnOptions],
  );

  // Only show if there are multiple Y candidates
  if (yAxisCandidates.length <= 1) {
    return null;
  }

  return (
    <Menu
      shadow="md"
      position="bottom-start"
      withinPortal
      opened={menuOpened}
      onChange={setMenuOpened}
      closeOnItemClick={false}
    >
      <Menu.Target>
        <Tooltip
          label={
            isSmallMultiplesMode
              ? `Comparing ${additionalYColumns.length + 1} metrics`
              : 'Compare metrics'
          }
          openDelay={400}
        >
          <ActionIcon
            variant={isSmallMultiplesMode ? 'secondary' : 'transparent'}
            size="sm"
            onClick={() => setMenuOpened((o) => !o)}
            disabled={disabled}
          >
            <IconStack2 size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Compare Metrics</Menu.Label>
        <Stack gap="xs" className="w-64 px-2 pb-2">
          <Menu.Label className="p-0 text-xs">
            Select additional Y columns to compare. Each metric gets its own chart with independent
            scale.
          </Menu.Label>
          <MultiSelect
            placeholder="Add metrics to compare"
            data={selectOptions}
            value={validatedAdditionalYColumns}
            onChange={handleAdditionalYColumnsChange}
            size="xs"
            clearable
            searchable
            maxValues={MAX_SMALL_MULTIPLES_COLUMNS}
            comboboxProps={{ withinPortal: true, zIndex: 1001 }}
          />
          {isSmallMultiplesMode && (
            <Menu.Label className="p-0 text-xs">Primary: {yAxisColumn}</Menu.Label>
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
