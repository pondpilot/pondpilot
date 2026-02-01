import { NamedIcon, IconType } from '@components/named-icon/named-icon';
import { Group, Skeleton, Stack, Text } from '@mantine/core';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn } from '@models/db';

import { classifyColumnType } from '../hooks';

/**
 * Height of each sparkline SVG in pixels.
 */
const SPARKLINE_HEIGHT = 20;

/**
 * Width of the sparkline SVG in pixels.
 */
const SPARKLINE_WIDTH = 120;

/**
 * Width of the percentage bar in pixels.
 */
const PERCENTAGE_BAR_WIDTH = 120;

export interface SummaryPanelProps {
  /** Dataset columns to display */
  columns: DBColumn[];
  /** Column stats keyed by column name */
  columnStats: Map<string, ColumnStats>;
  /** Column distributions keyed by column name */
  columnDistributions: Map<string, ColumnDistribution>;
  /** Whether stats are still being fetched */
  isLoading: boolean;
  /** Set of column names whose distributions are still loading */
  loadingDistributions: Set<string>;
  /** Callback when a column row is clicked */
  onColumnClick?: (columnName: string) => void;
  /** Currently selected column name */
  selectedColumn?: string;
}

/**
 * Maps a DBColumn's sqlType to the NamedIcon iconType.
 */
function getColumnIconType(column: DBColumn): IconType {
  return `column-${column.sqlType}` as IconType;
}

/**
 * Renders a percentage bar showing the ratio of distinct values to total count.
 * Used for text columns where a histogram doesn't make as much sense.
 */
function PercentageBar({ stats }: { stats: ColumnStats }) {
  const percentage =
    stats.totalCount > 0
      ? Math.round((stats.distinctCount / stats.totalCount) * 100)
      : 0;
  const barWidth = Math.round((percentage / 100) * PERCENTAGE_BAR_WIDTH);

  return (
    <Group gap={8} wrap="nowrap">
      <svg
        width={PERCENTAGE_BAR_WIDTH}
        height={8}
        role="img"
        aria-label={`${percentage}% distinct values`}
      >
        {/* Background track */}
        <rect
          x={0}
          y={0}
          width={PERCENTAGE_BAR_WIDTH}
          height={8}
          rx={4}
          className="fill-[var(--mantine-color-transparent008)]"
        />
        {/* Filled portion */}
        <rect
          x={0}
          y={0}
          width={barWidth}
          height={8}
          rx={4}
          className="fill-[var(--mantine-color-icon-accent)]"
        />
      </svg>
      <Text size="xs" c="text-tertiary" className="whitespace-nowrap tabular-nums">
        {percentage}%
      </Text>
    </Group>
  );
}

/**
 * Renders an inline SVG sparkline histogram from distribution buckets.
 * Used for numeric and date columns.
 */
function SparklineHistogram({
  buckets,
}: {
  buckets: { label: string; count: number }[];
}) {
  if (buckets.length === 0) {
    return null;
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));
  if (maxCount === 0) {
    return null;
  }

  const barGap = 1;
  const barWidth = Math.max(
    1,
    (SPARKLINE_WIDTH - (buckets.length - 1) * barGap) / buckets.length,
  );

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      role="img"
      aria-label="Distribution sparkline"
    >
      {buckets.map((bucket, i) => {
        const barHeight = Math.max(1, (bucket.count / maxCount) * SPARKLINE_HEIGHT);
        const x = i * (barWidth + barGap);
        const y = SPARKLINE_HEIGHT - barHeight;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={0.5}
            className="fill-[var(--mantine-color-icon-accent)]"
          />
        );
      })}
    </svg>
  );
}

/**
 * Renders the visualization for a column based on its type.
 */
function ColumnVisualization({
  column,
  stats,
  distribution,
  isDistributionLoading,
}: {
  column: DBColumn;
  stats: ColumnStats | undefined;
  distribution: ColumnDistribution | undefined;
  isDistributionLoading: boolean;
}) {
  if (isDistributionLoading || !stats) {
    return <Skeleton height={SPARKLINE_HEIGHT} width={SPARKLINE_WIDTH} />;
  }

  const columnType = classifyColumnType(column);

  if (columnType === 'text') {
    return <PercentageBar stats={stats} />;
  }

  // Numeric and date columns use sparkline histograms
  if (distribution && distribution.type !== 'text') {
    return <SparklineHistogram buckets={distribution.buckets} />;
  }

  return null;
}

/**
 * A single row in the summary panel representing one dataset column.
 */
function SummaryRow({
  column,
  stats,
  distribution,
  isDistributionLoading,
  isSelected,
  onClick,
}: {
  column: DBColumn;
  stats: ColumnStats | undefined;
  distribution: ColumnDistribution | undefined;
  isDistributionLoading: boolean;
  isSelected: boolean;
  onClick?: () => void;
}) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      className={`px-3 py-1.5 cursor-pointer rounded-md transition-colors ${
        isSelected
          ? 'bg-[var(--mantine-color-transparentBrandBlue_palette-012)]'
          : 'hover:bg-[var(--mantine-color-transparent004)]'
      }`}
      onClick={onClick}
    >
      <NamedIcon
        iconType={getColumnIconType(column)}
        size={16}
        stroke={1.5}
        className="text-[var(--mantine-color-icon-default)] shrink-0"
      />
      <Text
        size="sm"
        className="truncate min-w-0 flex-1"
        title={column.name}
      >
        {column.name}
      </Text>
      <div className="shrink-0">
        <ColumnVisualization
          column={column}
          stats={stats}
          distribution={distribution}
          isDistributionLoading={isDistributionLoading}
        />
      </div>
    </Group>
  );
}

/**
 * Summary panel showing a list where each row represents a column in the dataset.
 * Each row displays: type icon, column name, and a visualization
 * (percentage bar for text, sparkline histogram for numeric/date).
 */
export function SummaryPanel({
  columns,
  columnStats,
  columnDistributions,
  isLoading,
  loadingDistributions,
  onColumnClick,
  selectedColumn,
}: SummaryPanelProps) {
  if (isLoading) {
    return (
      <Stack gap={4} className="p-2">
        {Array.from({ length: Math.min(columns.length || 8, 20) }).map((_, i) => (
          <Group key={i} gap="sm" wrap="nowrap" className="px-3 py-1.5">
            <Skeleton height={16} width={16} circle />
            <Skeleton height={14} className="flex-1" />
            <Skeleton height={SPARKLINE_HEIGHT} width={SPARKLINE_WIDTH} />
          </Group>
        ))}
      </Stack>
    );
  }

  if (columns.length === 0) {
    return null;
  }

  return (
    <Stack gap={2} className="p-2 overflow-y-auto h-full">
      {columns.map((column) => (
        <SummaryRow
          key={column.name}
          column={column}
          stats={columnStats.get(column.name)}
          distribution={columnDistributions.get(column.name)}
          isDistributionLoading={loadingDistributions.has(column.name)}
          isSelected={selectedColumn === column.name}
          onClick={() => onColumnClick?.(column.name)}
        />
      ))}
    </Stack>
  );
}
