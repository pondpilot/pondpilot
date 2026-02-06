import { ActionIcon, Menu, Select, Stack, Tooltip } from '@mantine/core';
import { AggregationType, ChartConfig, ChartType, ColorScheme, SortOrder } from '@models/chart';
import { DBColumn } from '@models/db';
import { IconDots } from '@tabler/icons-react';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChartTypeSelector, ChartSettingsPopover, ChartComparePopover } from './components';

const OVERFLOW_BTN_WIDTH = 28;

/**
 * Hook that measures a container's width via ResizeObserver and determines
 * how many toolbar sections (given their minimum widths) can fit inline.
 * Sections that don't fit should be rendered in an overflow menu.
 *
 * Uses refs for changing values to keep the ResizeObserver stable across renders.
 */
function useToolbarOverflow(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sectionWidths: number[],
  gap: number,
): number {
  const [visibleCount, setVisibleCount] = useState(sectionWidths.length);

  // Store changing values in refs so the observer callback always reads current data
  const sectionWidthsRef = useRef(sectionWidths);
  sectionWidthsRef.current = sectionWidths;

  const gapRef = useRef(gap);
  gapRef.current = gap;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const recalculate = () => {
      const widths = sectionWidthsRef.current;
      const g = gapRef.current;
      const available = el.clientWidth;

      // If container has no width yet, show all items rather than hiding everything
      if (available <= 0) {
        setVisibleCount(widths.length);
        return;
      }

      let used = 0;
      let count = 0;

      for (let i = 0; i < widths.length; i += 1) {
        const w = widths[i];
        const added = w + (count > 0 ? g : 0);
        const wouldUse = used + added;

        // If this isn't the last section, reserve space for the overflow button
        const isLast = i === widths.length - 1;
        const needed = isLast ? wouldUse : wouldUse + OVERFLOW_BTN_WIDTH + g;

        if (needed > available) break;
        used = wouldUse;
        count += 1;
      }

      setVisibleCount(count);
    };

    const observer = new ResizeObserver(() => {
      recalculate();
    });

    observer.observe(el);

    // Measure immediately in case the element already has layout
    recalculate();

    return () => observer.disconnect();
    // Only depend on containerRef — sectionWidths and gap are read from refs
  }, [containerRef]);

  // Recalculate when sectionWidths change (e.g., group-by toggling)
  // without recreating the observer
  const sectionKey = sectionWidths.join(',');
  useEffect(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth <= 0) return;

    const widths = sectionWidthsRef.current;
    const g = gapRef.current;
    const available = el.clientWidth;

    let used = 0;
    let count = 0;

    for (let i = 0; i < widths.length; i += 1) {
      const w = widths[i];
      const added = w + (count > 0 ? g : 0);
      const wouldUse = used + added;
      const isLast = i === widths.length - 1;
      const needed = isLast ? wouldUse : wouldUse + OVERFLOW_BTN_WIDTH + g;
      if (needed > available) break;
      used = wouldUse;
      count += 1;
    }

    setVisibleCount(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  return visibleCount;
}

interface ToolbarSection {
  id: string;
  /** Minimum width this section occupies inline */
  minWidth: number;
  /** The inline element rendered in the toolbar */
  element: ReactNode;
  /** The element rendered inside the overflow menu (defaults to same as element) */
  overflowElement?: ReactNode;
  /** Whether this section should be included */
  visible: boolean;
}

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
 *
 * Uses a ResizeObserver to progressively collapse less essential controls
 * into an overflow menu when the container is too narrow.
 */
export function ChartConfigToolbar({
  chartConfig,
  xAxisCandidates,
  yAxisCandidates,
  groupByCandidates,
  onConfigChange,
  disabled,
}: ChartConfigToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if small multiples mode is active
  const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;

  // Conditions for showing toolbar elements
  const canShowGroupBy = chartConfig.chartType !== 'pie' && !isSmallMultiplesMode;
  const canShowSmallMultiples = chartConfig.chartType !== 'pie';

  const showGroupBy = canShowGroupBy && groupByCandidates.length > 0;

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

  const xAxisOptions = useMemo(
    () => xAxisCandidates.map((col) => ({ value: col.name, label: col.name })),
    [xAxisCandidates],
  );

  const yAxisOptions = useMemo(
    () => yAxisCandidates.map((col) => ({ value: col.name, label: col.name })),
    [yAxisCandidates],
  );

  const groupByOptions = useMemo(
    () => groupByCandidates.map((col) => ({ value: col.name, label: col.name })),
    [groupByCandidates],
  );

  // Define toolbar sections in priority order (first = most essential, last = first to hide)
  const sections: ToolbarSection[] = useMemo(
    () => [
      {
        id: 'chart-type',
        minWidth: 178,
        visible: true,
        element: (
          <ChartTypeSelector
            chartType={chartConfig.chartType}
            onChartTypeChange={handleChartTypeChange}
            disabled={disabled}
          />
        ),
      },
      {
        id: 'divider-axes',
        minWidth: 1,
        visible: true,
        element: <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />,
      },
      {
        id: 'x-axis',
        minWidth: 120,
        visible: true,
        element: (
          <Select
            placeholder="X-Axis"
            data={xAxisOptions}
            value={chartConfig.xAxisColumn}
            onChange={handleXAxisChange}
            size="xs"
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: 1000 }}
            w={120}
            classNames={{ input: 'pr-10' }}
          />
        ),
      },
      {
        id: 'y-axis',
        minWidth: 120,
        visible: true,
        element: (
          <Select
            placeholder="Y-Axis"
            data={yAxisOptions}
            value={chartConfig.yAxisColumn}
            onChange={handleYAxisChange}
            size="xs"
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: 1000 }}
            w={120}
            classNames={{ input: 'pr-10' }}
          />
        ),
      },
      {
        id: 'group-by',
        minWidth: 120,
        visible: showGroupBy,
        element: (
          <Select
            placeholder="Group by"
            data={groupByOptions}
            value={chartConfig.groupByColumn}
            onChange={handleGroupByChange}
            size="xs"
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: 1000 }}
            w={120}
          />
        ),
      },
      {
        id: 'compare',
        minWidth: 28,
        visible: canShowSmallMultiples,
        element: (
          <ChartComparePopover
            yAxisColumn={chartConfig.yAxisColumn}
            additionalYColumns={chartConfig.additionalYColumns}
            yAxisCandidates={yAxisCandidates}
            groupByColumn={chartConfig.groupByColumn}
            onAdditionalYColumnsChange={handleAdditionalYColumnsChange}
            disabled={disabled}
          />
        ),
      },
      {
        id: 'divider-settings',
        minWidth: 1,
        visible: true,
        element: <div className="w-px h-4 bg-borderPrimary-light dark:bg-borderPrimary-dark" />,
      },
      {
        id: 'settings',
        minWidth: 100,
        visible: true,
        element: (
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
        ),
      },
    ],
    [
      chartConfig,
      xAxisOptions,
      yAxisOptions,
      groupByOptions,
      yAxisCandidates,
      showGroupBy,
      canShowSmallMultiples,
      handleChartTypeChange,
      handleXAxisChange,
      handleYAxisChange,
      handleGroupByChange,
      handleAggregationChange,
      handleSortChange,
      handleTitleChange,
      handleXAxisLabelChange,
      handleYAxisLabelChange,
      handleColorSchemeChange,
      handleAdditionalYColumnsChange,
      disabled,
    ],
  );

  // Filter to only visible sections
  const activeSections = useMemo(() => sections.filter((s) => s.visible), [sections]);

  const sectionWidths = useMemo(() => activeSections.map((s) => s.minWidth), [activeSections]);

  const visibleCount = useToolbarOverflow(containerRef, sectionWidths, 8);

  const inlineSections = activeSections.slice(0, visibleCount);
  const overflowSections = activeSections.slice(visibleCount);

  // Filter out dividers from overflow — they don't make sense in a vertical menu
  const overflowContent = overflowSections.filter((s) => !s.id.startsWith('divider'));
  const hasOverflow = overflowContent.length > 0;

  return (
    <div ref={containerRef} className="flex items-center gap-2 min-w-0" style={{ flex: '1 1 0%' }}>
      {inlineSections.map((section) => (
        <div key={section.id} className="flex-shrink-0 flex items-center gap-2">
          {section.element}
        </div>
      ))}

      {hasOverflow && (
        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <Tooltip label="More options" openDelay={400}>
              <ActionIcon variant="transparent" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Stack gap="xs" className="p-2">
              {overflowContent.map((section) => (
                <div key={section.id}>{section.overflowElement ?? section.element}</div>
              ))}
            </Stack>
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}
