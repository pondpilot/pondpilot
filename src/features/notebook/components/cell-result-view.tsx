import { RowCountAndPaginationControl } from '@components/row-count-and-pagination-control/row-count-and-pagination-control';
import { Table } from '@components/table/table';
import {
  ChartConfigToolbar,
  ChartErrorBoundary,
  ChartView,
  useChartData,
  useSmallMultiplesData,
} from '@features/chart-view';
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Text,
} from '@mantine/core';
import { useDebouncedValue, useDidUpdate } from '@mantine/hooks';
import { ChartConfig, ViewMode } from '@models/chart';
import { DataAdapterApi, DataTableSlice } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { NotebookCellOutput } from '@models/notebook';
import { MAX_DATA_VIEW_PAGE_SIZE } from '@models/tab';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CellExecutionState } from '../hooks/use-notebook-execution-state';

interface CellResultViewProps {
  cellState: CellExecutionState;
  dataAdapter: DataAdapterApi | null;
  active: boolean;
  cellOutput: NotebookCellOutput;
  onOutputChange: (output: Partial<NotebookCellOutput>) => void;
  defaultCollapsed?: boolean;
}

const MAX_RESULT_HEIGHT = 400;

export const CellResultView = memo(({
  cellState,
  dataAdapter,
  active,
  cellOutput,
  onOutputChange,
  defaultCollapsed = false,
}: CellResultViewProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [userToggledCollapse, setUserToggledCollapse] = useState(false);
  const [requestedPage, setRequestedPage] = useState(0);
  const [dataSlice, setDataSlice] = useState<DataTableSlice | null>(null);
  const lastDataSourceVersion = useRef<number>(0);

  useEffect(() => {
    if (userToggledCollapse) return;
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, userToggledCollapse]);

  const toggleCollapsed = useCallback(() => {
    setUserToggledCollapse(true);
    setCollapsed((c) => !c);
  }, []);

  const handleViewModeChange = useCallback(
    (newMode: ViewMode) => {
      if (cellOutput.viewMode === newMode) return;
      onOutputChange({ viewMode: newMode });
    },
    [cellOutput.viewMode, onOutputChange],
  );

  const handleChartConfigChange = useCallback(
    (newConfig: Partial<ChartConfig>) => {
      const hasChanges = Object.entries(newConfig).some(
        ([key, value]) => cellOutput.chartConfig[key as keyof ChartConfig] !== value,
      );
      if (!hasChanges) return;
      onOutputChange({
        chartConfig: {
          ...cellOutput.chartConfig,
          ...newConfig,
        },
      });
    },
    [cellOutput.chartConfig, onOutputChange],
  );

  // Show nothing for idle cells
  if (cellState.status === 'idle') {
    return null;
  }

  // Error display
  if (cellState.status === 'error') {
    return (
      <div
        className={cn(
          'border-t border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
          'px-3 py-2',
        )}
      >
        <Group gap={6} align="flex-start">
          <IconAlertTriangle
            size={16}
            className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
          />
          <Text
            size="sm"
            className="font-mono whitespace-pre-wrap text-red-600 dark:text-red-400"
          >
            {cellState.error}
          </Text>
        </Group>
        {cellState.executionTime !== null && (
          <ExecutionTimeLabel timeMs={cellState.executionTime} />
        )}
      </div>
    );
  }

  // Running state
  if (cellState.status === 'running') {
    return (
      <div
        className={cn(
          'border-t border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
          'px-3 py-3',
        )}
      >
        <Group gap={6}>
          <Loader size={14} />
          <Text size="sm" c="dimmed">
            Running...
          </Text>
        </Group>
      </div>
    );
  }

  // Success state - show results
  if (!dataAdapter) {
    if (cellState.snapshot) {
      return (
        <SnapshotResultView
          snapshot={cellState.snapshot}
          executionTime={cellState.executionTime}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          active={active}
        />
      );
    }

    return (
      <div
        className={cn(
          'border-t border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
          'px-3 py-2',
        )}
      >
        <Group gap={6}>
          <IconCheck size={14} className="text-green-600 dark:text-green-400" />
          <Text size="sm" c="dimmed">
            Executed successfully
          </Text>
          {cellState.executionTime !== null && (
            <ExecutionTimeLabel timeMs={cellState.executionTime} />
          )}
        </Group>
      </div>
    );
  }

  return (
    <CellResultTable
      dataAdapter={dataAdapter}
      executionTime={cellState.executionTime}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      requestedPage={requestedPage}
      onPageChange={setRequestedPage}
      dataSlice={dataSlice}
      onDataSliceChange={setDataSlice}
      lastDataSourceVersionRef={lastDataSourceVersion}
      active={active}
      viewMode={cellOutput.viewMode}
      onViewModeChange={handleViewModeChange}
      chartConfig={cellOutput.chartConfig}
      onChartConfigChange={handleChartConfigChange}
    />
  );
});

CellResultView.displayName = 'CellResultView';

interface CellResultTableProps {
  dataAdapter: DataAdapterApi;
  executionTime: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  requestedPage: number;
  onPageChange: (page: number) => void;
  dataSlice: DataTableSlice | null;
  onDataSliceChange: (slice: DataTableSlice | null) => void;
  lastDataSourceVersionRef: React.MutableRefObject<number>;
  active: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  chartConfig: ChartConfig;
  onChartConfigChange: (config: Partial<ChartConfig>) => void;
}

const CellResultTable = memo(
  ({
    dataAdapter,
    executionTime,
    collapsed,
    onToggleCollapsed,
    requestedPage,
    onPageChange,
    dataSlice,
    onDataSliceChange,
    lastDataSourceVersionRef,
    active,
    viewMode,
    onViewModeChange,
    chartConfig,
    onChartConfigChange,
  }: CellResultTableProps) => {
    const hasData = dataAdapter.currentSchema.length > 0;
    const [isDebouncedFetching] = useDebouncedValue(dataAdapter.isFetchingData, 200);
    const isFetching = isDebouncedFetching && dataAdapter.isFetchingData;
    const isChartMode = viewMode === 'chart';

    const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;
    const shouldFetchChartData = isChartMode && !isSmallMultiplesMode && !collapsed;
    const smallMultiplesConfig = useMemo(
      () => (isChartMode ? chartConfig : { ...chartConfig, additionalYColumns: [] }),
      [isChartMode, chartConfig],
    );
    const chartDataResult = useChartData(dataAdapter, chartConfig, {
      enabled: shouldFetchChartData,
    });
    const smallMultiplesResult = useSmallMultiplesData(dataAdapter, smallMultiplesConfig);

    const { realRowCount, estimatedRowCount, availableRowCount } = dataAdapter.rowCountInfo;
    const isEstimatedRowCount = realRowCount === null;
    const rowCountToShow = realRowCount || estimatedRowCount || availableRowCount;

    const expectedRowFrom = Math.max(0, requestedPage * MAX_DATA_VIEW_PAGE_SIZE);
    const expectedRowTo = realRowCount
      ? Math.min(realRowCount, (requestedPage + 1) * MAX_DATA_VIEW_PAGE_SIZE)
      : (requestedPage + 1) * MAX_DATA_VIEW_PAGE_SIZE;

    const isSinglePage = Math.max(expectedRowTo, rowCountToShow) <= MAX_DATA_VIEW_PAGE_SIZE;

    const hasPrevPage = requestedPage > 0;
    const nextPage = requestedPage + 1;
    const hasNextPage = realRowCount ? nextPage * MAX_DATA_VIEW_PAGE_SIZE < realRowCount : true;

    const displayedRowFrom = dataSlice
      ? dataSlice.data.length > 0
        ? dataSlice.rowOffset + 1
        : 0
      : 0;
    const displayedRowTo = dataSlice ? dataSlice.rowOffset + dataSlice.data.length : 0;

    const handleNextPage = useCallback(() => {
      if (hasNextPage) onPageChange(nextPage);
    }, [hasNextPage, nextPage, onPageChange]);

    const handlePrevPage = useCallback(() => {
      if (requestedPage > 0) onPageChange(requestedPage - 1);
    }, [requestedPage, onPageChange]);

    const handleSort = useCallback(
      (sortField: DBColumn['name']) => {
        dataAdapter.toggleColumnSort(sortField);
      },
      // Fails to detect that we only need `toggleColumnSort` from dataAdapter
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [dataAdapter.toggleColumnSort],
    );

    // No-op handlers for required Table props (no column summary in notebook cells)
    const noopSelectChange = useCallback(() => {}, []);
    const noopColumnSelect = useCallback((_col: DBColumn | null) => {}, []);

    // Sync data from data adapter
    useDidUpdate(() => {
      if (lastDataSourceVersionRef.current !== dataAdapter.dataSourceVersion) {
        lastDataSourceVersionRef.current = dataAdapter.dataSourceVersion;
        onPageChange(0);
        const newData = dataAdapter.getDataTableSlice(0, MAX_DATA_VIEW_PAGE_SIZE);
        onDataSliceChange(newData);
      } else {
        const newData = dataAdapter.getDataTableSlice(expectedRowFrom, expectedRowTo);
        onDataSliceChange(newData);
      }
    }, [
      dataAdapter.dataVersion,
      dataAdapter.dataSourceVersion,
      dataAdapter.getDataTableSlice,
      expectedRowFrom,
      expectedRowTo,
    ]);

    return (
      <div
        className={cn(
          'border-t border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
        )}
      >
        {/* Result header */}
        <Group
          gap={4}
          justify="space-between"
          wrap="nowrap"
          className="px-3 py-1 select-none"
        >
          <Group gap={6} wrap="nowrap" className="cursor-pointer" onClick={onToggleCollapsed}>
            <ActionIcon size="xs" variant="subtle">
              {collapsed ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
            </ActionIcon>
            <IconCheck size={14} className="text-green-600 dark:text-green-400" />
            <Text size="xs" c="dimmed">
              {rowCountToShow} row{rowCountToShow !== 1 ? 's' : ''}
              {isEstimatedRowCount && rowCountToShow > 0 ? ' (estimated)' : ''}
            </Text>
            {executionTime !== null && <ExecutionTimeLabel timeMs={executionTime} />}
            {isFetching && <Loader size={10} />}
          </Group>

          <SegmentedControl
            size="xs"
            value={viewMode}
            onChange={(value) => onViewModeChange(value as ViewMode)}
            data={[
              { value: 'table', label: 'Table' },
              { value: 'chart', label: 'Chart' },
            ]}
            disabled={!hasData}
          />
        </Group>

        {/* Chart toolbar */}
        {!collapsed && hasData && isChartMode && (
          <div className="px-3 pb-2 overflow-auto custom-scroll-hidden">
            <ChartConfigToolbar
              chartConfig={chartConfig}
              xAxisCandidates={chartDataResult.xAxisCandidates}
              yAxisCandidates={chartDataResult.yAxisCandidates}
              groupByCandidates={chartDataResult.groupByCandidates}
              onConfigChange={onChartConfigChange}
            />
          </div>
        )}

        {/* Result table */}
        {!collapsed && hasData && dataSlice && !isChartMode && (
          <div className="relative">
            <div
              className="overflow-auto px-3 pb-1 custom-scroll-hidden"
              style={{ maxHeight: MAX_RESULT_HEIGHT }}
            >
              <Table
                dataSlice={dataSlice}
                schema={dataAdapter.currentSchema}
                sort={dataAdapter.sort}
                visible={active}
                onSort={dataAdapter.disableSort ? undefined : handleSort}
                onRowSelectChange={noopSelectChange}
                onCellSelectChange={noopSelectChange}
                onColumnSelectChange={noopColumnSelect}
              />
            </div>
            {!isSinglePage && (
              <div className="flex justify-center py-1">
                <RowCountAndPaginationControl
                  rowFrom={displayedRowFrom}
                  rowTo={displayedRowTo}
                  isSinglePage={isSinglePage}
                  isDisabled={!hasData}
                  hasPrevPage={hasPrevPage}
                  hasNextPage={hasNextPage}
                  rowCount={rowCountToShow}
                  onPrevPage={handlePrevPage}
                  onNextPage={handleNextPage}
                  isEstimatedRowCount={isEstimatedRowCount}
                />
              </div>
            )}
          </div>
        )}

        {/* Result chart */}
        {!collapsed && hasData && isChartMode && (
          <div className="px-3 pb-2 h-[340px]">
            <ChartErrorBoundary onSwitchToTable={() => onViewModeChange('table')}>
              <ChartView
                chartConfig={chartConfig}
                onConfigChange={onChartConfigChange}
                chartDataResult={chartDataResult}
                smallMultiplesResult={smallMultiplesResult}
              />
            </ChartErrorBoundary>
          </div>
        )}

        {/* Loading state when no data yet */}
        {!collapsed && !hasData && isFetching && (
          <Center className="py-4">
            <Group gap={6}>
              <Loader size={14} />
              <Text size="sm" c="dimmed">
                Loading results...
              </Text>
            </Group>
          </Center>
        )}
      </div>
    );
  },
);

CellResultTable.displayName = 'CellResultTable';

interface SnapshotResultViewProps {
  snapshot: NonNullable<CellExecutionState['snapshot']>;
  executionTime: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  active: boolean;
}

const SnapshotResultView = memo(({
  snapshot,
  executionTime,
  collapsed,
  onToggleCollapsed,
  active,
}: SnapshotResultViewProps) => {
  const capturedAtLabel = useMemo(() => {
    const capturedAtMs = Date.parse(snapshot.capturedAt);
    if (Number.isNaN(capturedAtMs)) return 'unknown time';
    return new Date(capturedAtMs).toLocaleString();
  }, [snapshot.capturedAt]);

  const snapshotDataSlice = useMemo(
    () => ({ data: snapshot.data, rowOffset: 0 }),
    [snapshot.data],
  );

  const staleMessage = snapshot.truncated
    ? [
      'Showing first ',
      String(snapshot.data.length),
      ' rows from the last run. Re-run the cell to refresh.',
    ].join('')
    : 'Showing saved snapshot from the last run. Re-run the cell to refresh.';

  const emptySort = useMemo(() => [], []);
  const noopSelectChange = useCallback(() => {}, []);
  const noopColumnSelect = useCallback((_col: DBColumn | null) => {}, []);

  return (
    <div
      className={cn(
        'border-t border-borderPrimary-light dark:border-borderPrimary-dark',
        'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
      )}
    >
      <Group
        gap={4}
        justify="space-between"
        wrap="nowrap"
        className="px-3 py-1 select-none"
      >
        <Group gap={6} wrap="nowrap" className="cursor-pointer" onClick={onToggleCollapsed}>
          <ActionIcon size="xs" variant="subtle">
            {collapsed ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
          </ActionIcon>
          <IconClock size={14} className="text-yellow-500 dark:text-yellow-400" />
          <Text size="xs" c="dimmed">
            Showing saved results from {capturedAtLabel}
          </Text>
          {executionTime !== null && <ExecutionTimeLabel timeMs={executionTime} />}
        </Group>
      </Group>

      {!collapsed && (
        <>
          <div className="px-3 pb-1">
            <Text size="xs" c="dimmed">{staleMessage}</Text>
          </div>
          {snapshot.schema.length > 0 && (
            <div className="relative">
              <div
                className="overflow-auto px-3 pb-1 custom-scroll-hidden"
                style={{ maxHeight: MAX_RESULT_HEIGHT }}
              >
                <Table
                  dataSlice={snapshotDataSlice}
                  schema={snapshot.schema}
                  sort={emptySort}
                  visible={active}
                  onSort={undefined}
                  onRowSelectChange={noopSelectChange}
                  onCellSelectChange={noopSelectChange}
                  onColumnSelectChange={noopColumnSelect}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

SnapshotResultView.displayName = 'SnapshotResultView';

function ExecutionTimeLabel({ timeMs }: { timeMs: number }) {
  const formatted = timeMs < 1000 ? `${timeMs}ms` : `${(timeMs / 1000).toFixed(1)}s`;
  return (
    <Group gap={2}>
      <IconClock size={12} className="text-iconDefault-light dark:text-iconDefault-dark" />
      <Text size="xs" c="dimmed">
        {formatted}
      </Text>
    </Group>
  );
}
