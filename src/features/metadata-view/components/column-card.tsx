import { NamedIcon } from '@components/named-icon/named-icon';
import { Group, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn } from '@models/db';

import { classifyColumnType, getColumnIconType } from '../hooks';

/**
 * Height of a single bar in the horizontal bar histogram.
 */
const BAR_HEIGHT = 16;

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
 * Formats a number compactly: 1234 → "1.2K", 1234567 → "1.2M", etc.
 * Small numbers (< 1000) are shown as-is with locale separators.
 */
function formatCompact(value: number): string {
  if (Math.abs(value) < 1000) {
    return value.toLocaleString();
  }
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formats a bucket label to a reasonable precision.
 * Trims excessive decimal places and uses compact notation for large numbers.
 * Range labels like "1234.5678 - 5678.1234" become "1.2K - 5.7K".
 */
function formatBucketLabel(label: string): string {
  // Replace each number in the label with a compact version
  return label.replace(/-?\d+(\.\d+)?/g, (match) => {
    const num = parseFloat(match);
    if (Number.isNaN(num)) return match;
    if (Math.abs(num) >= 1000) return formatCompact(num);
    // For small numbers, keep 1 decimal max
    if (match.includes('.')) {
      return num.toFixed(1);
    }
    return match;
  });
}

/**
 * Renders a list of top values for text columns.
 * Each value is overlaid on a subtle background chip — the text IS the bar.
 * This matches the reference design where labels sit on their bars.
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

  return (
    <Stack gap={4}>
      {items.map((item) => (
        <Tooltip
          key={item.value}
          label={item.value}
          disabled={item.value.length <= 28}
          multiline
          maw={300}
          withinPortal
        >
          <div className="inline-flex items-center self-start max-w-full rounded bg-transparent008-light dark:bg-transparent008-dark px-2 py-0.5">
            <Text size="xs" className="truncate min-w-0">
              {item.value}
            </Text>
          </div>
        </Tooltip>
      ))}
    </Stack>
  );
}

/**
 * Renders a horizontal bar histogram for numeric or date columns.
 * Count labels sit to the left; bars extend right from the label.
 * The count IS the label — no separate count column needed.
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

  return (
    <Stack gap={2}>
      {buckets.map((bucket, i) => {
        const ratio = bucket.count / maxCount;
        const formattedLabel = formatBucketLabel(bucket.label);

        return (
          <Tooltip
            key={i}
            label={bucket.label}
            disabled={formattedLabel === bucket.label}
            withinPortal
          >
            <div className="flex items-center gap-1.5 h-5">
              <Text
                size="xs"
                c="text-tertiary"
                className="tabular-nums text-right shrink-0 truncate"
                style={{ width: '4.5rem' }}
              >
                {formattedLabel}
              </Text>
              <div className="flex-1 min-w-0 h-full flex items-center">
                <div
                  className="h-full rounded-sm bg-iconAccent-light dark:bg-iconAccent-dark"
                  style={{
                    width: `${Math.max(3, ratio * 100)}%`,
                    opacity: 0.35 + ratio * 0.45,
                  }}
                />
              </div>
            </div>
          </Tooltip>
        );
      })}
    </Stack>
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
 * Uses the same visual language as the data table (rounded corners, header row, borders).
 */
export function ColumnCard({
  column,
  stats,
  distribution,
  isDistributionLoading,
  error,
}: ColumnCardProps) {
  return (
    <div className="shrink-0 w-72 h-full rounded-xl border border-borderLight-light dark:border-borderLight-dark snap-start overflow-hidden flex flex-col">
      {/* Card header - styled like a table header row */}
      <Group
        gap="xs"
        wrap="nowrap"
        className="px-3 py-[11px] bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark shrink-0"
      >
        <NamedIcon
          iconType={getColumnIconType(column)}
          size={16}
          stroke={1.5}
          className="text-iconDefault-light dark:text-iconDefault-dark shrink-0"
        />
        <Text size="sm" fw={500} className="truncate min-w-0" title={column.name}>
          {column.name}
        </Text>
        {stats && (
          <Text size="xs" c="text-tertiary" className="whitespace-nowrap shrink-0 ml-auto">
            {formatCompact(stats.distinctCount)}
          </Text>
        )}
      </Group>

      {/* Card body */}
      <div className="p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
        <CardBody
          column={column}
          distribution={distribution}
          isDistributionLoading={isDistributionLoading}
          error={error}
        />
      </div>
    </div>
  );
}
