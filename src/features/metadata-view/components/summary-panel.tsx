import { NamedIcon } from '@components/named-icon/named-icon';
import { Group, Skeleton, Text } from '@mantine/core';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { cn } from '@utils/ui/styles';

import { classifyColumnType, getColumnIconType } from '../hooks';

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
  /** Per-column error messages, keyed by column name */
  errors?: Map<string, string>;
  /** Callback when a column row is clicked */
  onColumnClick?: (columnName: string) => void;
  /** Currently selected column name */
  selectedColumn?: string;
}

/**
 * Renders a percentage bar showing the ratio of distinct values to total count.
 * Used for text columns where a histogram doesn't make as much sense.
 */
function PercentageBar({ stats }: { stats: ColumnStats }) {
  const percentage =
    stats.totalCount > 0 ? Math.round((stats.distinctCount / stats.totalCount) * 100) : 0;
  // Ensure minimum width so the percentage label is always readable on the filled bar
  const barWidth = Math.max(30, Math.round((percentage / 100) * PERCENTAGE_BAR_WIDTH));

  return (
    <Group gap={8} wrap="nowrap">
      <div
        className="relative"
        style={{ width: PERCENTAGE_BAR_WIDTH, height: SPARKLINE_HEIGHT }}
        role="img"
        aria-label={`${percentage}% distinct values`}
      >
        {/* Background track */}
        <div className="absolute inset-0 rounded bg-transparent008-light dark:bg-transparent008-dark" />
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded bg-iconAccent-light dark:bg-iconAccent-dark"
          style={{ width: barWidth }}
        />
        {/* Percentage label overlaid on bar */}
        <span className="absolute inset-y-0 left-1.5 flex items-center text-[11px] font-medium tabular-nums text-white">
          {percentage}%
        </span>
      </div>
    </Group>
  );
}

/**
 * Renders an inline SVG sparkline histogram from distribution buckets.
 * Used for numeric and date columns.
 */
function SparklineHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  if (buckets.length === 0) {
    return null;
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));
  if (maxCount === 0) {
    return null;
  }

  const barGap = 1;
  const barWidth = Math.max(1, (SPARKLINE_WIDTH - (buckets.length - 1) * barGap) / buckets.length);

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
            className="fill-iconAccent-light dark:fill-iconAccent-dark"
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
  error,
}: {
  column: DBColumn;
  stats: ColumnStats | undefined;
  distribution: ColumnDistribution | undefined;
  isDistributionLoading: boolean;
  error?: string;
}) {
  if (isDistributionLoading || !stats) {
    return <Skeleton height={SPARKLINE_HEIGHT} width={SPARKLINE_WIDTH} />;
  }

  if (error) {
    return (
      <Text size="xs" c="red" className="truncate" title={error}>
        Error
      </Text>
    );
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
  isOdd,
  isLast,
  error,
  onClick,
}: {
  column: DBColumn;
  stats: ColumnStats | undefined;
  distribution: ColumnDistribution | undefined;
  isDistributionLoading: boolean;
  isSelected: boolean;
  isOdd: boolean;
  isLast: boolean;
  error?: string;
  onClick?: () => void;
}) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      className={cn(
        'px-3 py-1.5 cursor-pointer transition-colors border-b border-borderLight-light dark:border-borderLight-dark',
        isOdd && 'bg-transparent004-light dark:bg-transparent004-dark',
        isLast && 'rounded-b-xl border-b',
        isSelected
          ? 'bg-transparentBrandBlue_palette-012-light dark:bg-transparentBrandBlue_palette-012-dark'
          : 'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
      )}
      onClick={onClick}
    >
      <NamedIcon
        iconType={getColumnIconType(column)}
        size={16}
        stroke={1.5}
        className="text-iconDefault-light dark:text-iconDefault-dark shrink-0"
      />
      <Text size="sm" className="truncate min-w-0 flex-1" title={column.name}>
        {column.name}
      </Text>
      <div className="shrink-0">
        <ColumnVisualization
          column={column}
          stats={stats}
          distribution={distribution}
          isDistributionLoading={isDistributionLoading}
          error={error}
        />
      </div>
    </Group>
  );
}

/**
 * Summary panel showing a table-like list where each row represents a column in the dataset.
 * Each row displays: type icon, column name, and a visualization
 * (percentage bar for text, sparkline histogram for numeric/date).
 */
export function SummaryPanel({
  columns,
  columnStats,
  columnDistributions,
  isLoading,
  loadingDistributions,
  errors,
  onColumnClick,
  selectedColumn,
}: SummaryPanelProps) {
  if (isLoading) {
    return (
      <div className="p-3 h-full">
        <div className="rounded-xl border border-borderLight-light dark:border-borderLight-dark overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-t-xl">
            <Skeleton height={14} width={100} />
            <div className="ml-auto">
              <Skeleton height={14} width={140} />
            </div>
          </div>
          {Array.from({ length: Math.min(columns.length || 8, 20) }).map((_, i) => (
            <Group
              key={i}
              gap="sm"
              wrap="nowrap"
              className="px-3 py-1.5 border-b border-borderLight-light dark:border-borderLight-dark"
            >
              <Skeleton height={16} width={16} circle />
              <Skeleton height={14} className="flex-1" />
              <Skeleton height={SPARKLINE_HEIGHT} width={SPARKLINE_WIDTH} />
            </Group>
          ))}
        </div>
      </div>
    );
  }

  if (columns.length === 0) {
    return null;
  }

  return (
    <div className="p-3 overflow-y-auto h-full">
      <div className="rounded-xl border border-borderLight-light dark:border-borderLight-dark overflow-hidden">
        {/* Table header */}
        <Group
          gap="sm"
          wrap="nowrap"
          className="px-3 py-[11px] bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-t-xl"
        >
          <Text size="sm" fw={500} className="min-w-0 flex-1">
            Column Name
          </Text>
          <Group gap={4} wrap="nowrap" className="shrink-0">
            <NamedIcon
              iconType="column-string"
              size={14}
              stroke={1.5}
              className="text-iconDefault-light dark:text-iconDefault-dark"
            />
            <Text size="xs" c="text-secondary" className="whitespace-nowrap">
              COUNTD %
            </Text>
            <Text size="xs" c="text-tertiary">
              |
            </Text>
            <NamedIcon
              iconType="column-integer"
              size={14}
              stroke={1.5}
              className="text-iconDefault-light dark:text-iconDefault-dark"
            />
            <Text size="xs" c="text-secondary" className="whitespace-nowrap">
              Freq.Distr
            </Text>
          </Group>
        </Group>
        {/* Table body */}
        {columns.map((column, index) => (
          <SummaryRow
            key={column.name}
            column={column}
            stats={columnStats.get(column.name)}
            distribution={columnDistributions.get(column.name)}
            isDistributionLoading={loadingDistributions.has(column.name)}
            isSelected={selectedColumn === column.name}
            isOdd={index % 2 !== 0}
            isLast={index === columns.length - 1}
            error={errors?.get(column.name)}
            onClick={() => onColumnClick?.(column.name)}
          />
        ))}
      </div>
    </div>
  );
}
