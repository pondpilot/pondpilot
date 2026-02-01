import { NamedIcon } from '@components/named-icon/named-icon';
import { Group, Skeleton, Stack, Text } from '@mantine/core';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { formatNumber } from '@utils/helpers';

import { classifyColumnType, getColumnIconType } from '../hooks';

/**
 * Height of a single bar in the horizontal bar histogram.
 */
const BAR_HEIGHT = 16;

/**
 * Gap between bars in the histogram.
 */
const BAR_GAP = 4;

/**
 * Maximum width of histogram bars in pixels.
 */
const MAX_BAR_WIDTH = 160;

/**
 * Number of top values to show for text columns.
 */
const TOP_VALUES_LIMIT = 10;

export interface ColumnCardProps {
  /** The dataset column this card represents */
  column: DBColumn;
  /** Summary stats for this column */
  stats: ColumnStats | undefined;
  /** Distribution data for this column */
  distribution: ColumnDistribution | undefined;
  /** Whether the distribution is still loading */
  isDistributionLoading: boolean;
  /** Error message if distribution loading failed for this column */
  error?: string;
}

/**
 * Renders a list of top values with occurrence counts for text columns.
 */
function TextDistribution({ values }: { values: { value: string; count: number }[] }) {
  const items = values.slice(0, TOP_VALUES_LIMIT);

  if (items.length === 0) {
    return (
      <Text size="xs" c="text-tertiary">
        No values
      </Text>
    );
  }

  const maxCount = Math.max(...items.map((v) => v.count));

  return (
    <Stack gap={2}>
      {items.map((item) => {
        const barWidth =
          maxCount > 0 ? Math.max(2, (item.count / maxCount) * MAX_BAR_WIDTH) : 0;

        return (
          <Group key={item.value} gap={8} wrap="nowrap" align="center">
            <div className="relative h-5 shrink-0" style={{ width: MAX_BAR_WIDTH }}>
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-[var(--mantine-color-icon-accent)] opacity-20"
                style={{ width: barWidth }}
              />
              <Text
                size="xs"
                className="absolute inset-0 flex items-center px-1.5 truncate"
                title={item.value}
              >
                {item.value}
              </Text>
            </div>
            <Text size="xs" c="text-tertiary" className="whitespace-nowrap tabular-nums shrink-0">
              {formatNumber(item.count)}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

/**
 * Renders a horizontal bar histogram for numeric or date columns using inline SVG.
 */
function BarHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  if (buckets.length === 0) {
    return (
      <Text size="xs" c="text-tertiary">
        No data
      </Text>
    );
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));
  if (maxCount === 0) {
    return (
      <Text size="xs" c="text-tertiary">
        No data
      </Text>
    );
  }

  const totalHeight = buckets.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;

  return (
    <div className="flex gap-2">
      <div className="flex flex-col shrink-0" style={{ gap: BAR_GAP }}>
        {buckets.map((bucket) => (
          <Text
            key={bucket.label}
            size="xs"
            c="text-tertiary"
            className="whitespace-nowrap tabular-nums text-right"
            style={{ height: BAR_HEIGHT, lineHeight: `${BAR_HEIGHT}px` }}
            title={bucket.label}
          >
            {bucket.label}
          </Text>
        ))}
      </div>
      <svg
        width={MAX_BAR_WIDTH}
        height={totalHeight}
        role="img"
        aria-label="Distribution histogram"
      >
        {buckets.map((bucket, i) => {
          const barWidth = Math.max(2, (bucket.count / maxCount) * MAX_BAR_WIDTH);
          const y = i * (BAR_HEIGHT + BAR_GAP);

          return (
            <rect
              key={i}
              x={0}
              y={y}
              width={barWidth}
              height={BAR_HEIGHT}
              rx={2}
              className="fill-[var(--mantine-color-icon-accent)]"
              opacity={0.6}
            />
          );
        })}
      </svg>
      <div className="flex flex-col shrink-0" style={{ gap: BAR_GAP }}>
        {buckets.map((bucket) => (
          <Text
            key={bucket.label}
            size="xs"
            c="text-tertiary"
            className="whitespace-nowrap tabular-nums"
            style={{ height: BAR_HEIGHT, lineHeight: `${BAR_HEIGHT}px` }}
          >
            {formatNumber(bucket.count)}
          </Text>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders the card body based on column type.
 */
function CardBody({
  column,
  distribution,
  isDistributionLoading,
  error,
}: {
  column: DBColumn;
  distribution: ColumnDistribution | undefined;
  isDistributionLoading: boolean;
  error?: string;
}) {
  if (isDistributionLoading) {
    return (
      <Stack gap={4}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={BAR_HEIGHT} />
        ))}
      </Stack>
    );
  }

  if (error) {
    return (
      <Text size="xs" c="red" title={error}>
        Failed to load distribution
      </Text>
    );
  }

  if (!distribution) {
    return (
      <Text size="xs" c="text-tertiary">
        No distribution data
      </Text>
    );
  }

  const columnType = classifyColumnType(column);

  if (columnType === 'text' && distribution.type === 'text') {
    return <TextDistribution values={distribution.values} />;
  }

  if (distribution.type !== 'text') {
    return <BarHistogram buckets={distribution.buckets} />;
  }

  return null;
}

/**
 * A card component displaying detailed distribution data for a single dataset column.
 * Used in the detail panel (right side) of the metadata view.
 */
export function ColumnCard({
  column,
  stats,
  distribution,
  isDistributionLoading,
  error,
}: ColumnCardProps) {
  return (
    <div className="shrink-0 w-72 rounded-lg border border-[var(--mantine-color-transparent008)] p-3 snap-start">
      <Stack gap="sm">
        {/* Card header */}
        <Group gap="xs" wrap="nowrap">
          <NamedIcon
            iconType={getColumnIconType(column)}
            size={16}
            stroke={1.5}
            className="text-[var(--mantine-color-icon-default)] shrink-0"
          />
          <Text size="sm" fw={500} className="truncate min-w-0" title={column.name}>
            {column.name}
          </Text>
          {stats && (
            <Text size="xs" c="text-tertiary" className="whitespace-nowrap shrink-0">
              {formatNumber(stats.distinctCount)} distinct
            </Text>
          )}
        </Group>

        {/* Card body */}
        <CardBody
          column={column}
          distribution={distribution}
          isDistributionLoading={isDistributionLoading}
          error={error}
        />
      </Stack>
    </div>
  );
}
