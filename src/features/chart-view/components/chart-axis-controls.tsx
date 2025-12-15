import { Select } from '@mantine/core';
import { DBColumn } from '@models/db';
import { useCallback, useMemo } from 'react';

interface ChartAxisControlsProps {
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  groupByColumn: string | null;
  xAxisCandidates: DBColumn[];
  yAxisCandidates: DBColumn[];
  groupByCandidates: DBColumn[];
  onXAxisChange: (value: string | null) => void;
  onYAxisChange: (value: string | null) => void;
  onGroupByChange: (value: string | null) => void;
  /** Whether to show group by control */
  showGroupBy: boolean;
  disabled?: boolean;
}

/**
 * Axis selection controls for chart configuration.
 * Handles X-axis, Y-axis, and optional Group By column selection.
 */
export function ChartAxisControls({
  xAxisColumn,
  yAxisColumn,
  groupByColumn,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onXAxisChange,
  onYAxisChange,
  onGroupByChange,
  showGroupBy,
  disabled,
}: ChartAxisControlsProps) {
  const handleXAxisChange = useCallback(
    (value: string | null) => {
      onXAxisChange(value);
    },
    [onXAxisChange],
  );

  const handleYAxisChange = useCallback(
    (value: string | null) => {
      onYAxisChange(value);
    },
    [onYAxisChange],
  );

  const handleGroupByChange = useCallback(
    (value: string | null) => {
      onGroupByChange(value);
    },
    [onGroupByChange],
  );

  const xAxisOptions = useMemo(
    () =>
      xAxisCandidates.map((col) => ({
        value: col.name,
        label: col.name,
      })),
    [xAxisCandidates],
  );

  const yAxisOptions = useMemo(
    () =>
      yAxisCandidates.map((col) => ({
        value: col.name,
        label: col.name,
      })),
    [yAxisCandidates],
  );

  const groupByOptions = useMemo(
    () =>
      groupByCandidates.map((col) => ({
        value: col.name,
        label: col.name,
      })),
    [groupByCandidates],
  );

  return (
    <>
      <Select
        placeholder="X-Axis"
        data={xAxisOptions}
        value={xAxisColumn}
        onChange={handleXAxisChange}
        size="xs"
        clearable
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
        w={120}
        classNames={{
          input: 'pr-10',
        }}
      />

      <Select
        placeholder="Y-Axis"
        data={yAxisOptions}
        value={yAxisColumn}
        onChange={handleYAxisChange}
        size="xs"
        clearable
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
        w={120}
        classNames={{
          input: 'pr-10',
        }}
      />

      {showGroupBy && groupByOptions.length > 0 && (
        <Select
          placeholder="Group by"
          data={groupByOptions}
          value={groupByColumn}
          onChange={handleGroupByChange}
          size="xs"
          clearable
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: 1000 }}
          w={120}
        />
      )}
    </>
  );
}
