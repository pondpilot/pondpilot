import { Badge, Button, Card, Group, Progress, Stack, Text, rem } from '@mantine/core';
import { ComparisonExecutionProgress, ComparisonExecutionStage } from '@models/comparison';
import { useEffect, useMemo, useState } from 'react';

const STAGE_LABELS: Record<ComparisonExecutionStage, string> = {
  idle: 'Idle',
  queued: 'Queued',
  counting: 'Counting',
  splitting: 'Splitting',
  inserting: 'Inserting',
  'bucket-complete': 'Bucket complete',
  finalizing: 'Finalizing',
  completed: 'Completed',
  partial: 'Partial results',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const STAGE_COLORS: Partial<Record<ComparisonExecutionStage, string>> = {
  counting: 'blue',
  splitting: 'blue',
  inserting: 'blue',
  'bucket-complete': 'green',
  finalizing: 'cyan',
  completed: 'teal',
  partial: 'teal',
  cancelled: 'orange',
  failed: 'red',
  queued: 'gray',
};

type ComparisonExecutionProgressCardProps = {
  progress: ComparisonExecutionProgress;
  onCancel: () => void;
  onFinishEarly?: () => void;
};

const isTerminalStage = (stage: ComparisonExecutionStage): boolean =>
  stage === 'completed' || stage === 'cancelled' || stage === 'failed' || stage === 'partial';

export const ComparisonExecutionProgressCard = ({
  progress,
  onCancel,
  onFinishEarly,
}: ComparisonExecutionProgressCardProps) => {
  const [now, setNow] = useState(() => Date.now());
  const totalBuckets = Math.max(progress.totalBuckets, 1);
  const completedBuckets = Math.min(progress.completedBuckets, totalBuckets);
  const percent = Math.min(100, Math.max(0, (completedBuckets / totalBuckets) * 100));
  const stageLabel = STAGE_LABELS[progress.stage] ?? 'Processing';
  const badgeColor = STAGE_COLORS[progress.stage] ?? 'gray';
  const terminal = isTerminalStage(progress.stage);
  useEffect(() => {
    if (terminal) {
      setNow(Date.now());
      return undefined;
    }

    if (typeof window === 'undefined') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [terminal, progress.startedAt]);
  const elapsedSeconds = useMemo(() => {
    const reference = terminal ? progress.updatedAt : now;
    return Math.max(0, (reference - progress.startedAt) / 1000);
  }, [terminal, progress.updatedAt, progress.startedAt, now]);
  const showCancelButton = !terminal && !progress.cancelRequested;
  const showFinishEarlyButton = !terminal && progress.supportsFinishEarly && Boolean(onFinishEarly);
  const cancelBadge =
    progress.cancelRequested && !terminal ? (
      <Badge color="orange" variant="light">
        Cancelling…
      </Badge>
    ) : null;
  const elapsedLabel =
    elapsedSeconds >= 60
      ? `${Math.floor(elapsedSeconds / 60)}m ${(elapsedSeconds % 60).toFixed(0)}s`
      : `${elapsedSeconds.toFixed(1)}s`;

  return (
    <Card withBorder radius="md" padding="md" shadow="sm" w="100%" maw={rem(600)} miw={rem(360)}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="xs" align="center">
            <Text fw={600}>Comparison progress</Text>
            <Badge color={badgeColor} variant="light">
              {stageLabel}
            </Badge>
            {cancelBadge}
          </Group>
          <Group gap="xs">
            {showFinishEarlyButton && (
              <Button size="xs" variant="light" onClick={onFinishEarly}>
                Finish early
              </Button>
            )}
            {showCancelButton && (
              <Button size="xs" variant="light" color="red" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </Group>
        </Group>

        <Progress
          value={percent}
          animated={!terminal}
          striped={!terminal}
          size="lg"
          transitionDuration={200}
        />

        <Group gap="lg">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Segments processed
            </Text>
            <Text size="sm" fw={500}>
              {completedBuckets.toLocaleString()} of {totalBuckets.toLocaleString()}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Rows scanned
            </Text>
            <Text size="sm" fw={500}>
              {progress.processedRows.toLocaleString()}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Differences found
            </Text>
            <Text size="sm" fw={500}>
              {progress.diffRows.toLocaleString()}
            </Text>
          </Stack>
        </Group>

        {progress.currentBucket && !terminal && (
          <Stack gap={4}>
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">
                Currently scanning
              </Text>
              {typeof progress.currentBucket.bucket === 'number' &&
                typeof progress.currentBucket.modulus === 'number' && (
                  <Text size="sm" fw={500}>
                    bucket {progress.currentBucket.bucket.toLocaleString()} of{' '}
                    {progress.currentBucket.modulus.toLocaleString()}
                  </Text>
                )}
              <Text size="xs" c="dimmed">
                depth {progress.currentBucket.depth}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              Rows: {progress.currentBucket.countA.toLocaleString()} (A),{' '}
              {progress.currentBucket.countB.toLocaleString()} (B)
            </Text>
          </Stack>
        )}

        {progress.stage === 'failed' && progress.error && (
          <Text size="sm" c="red" lh={rem(18)}>
            {progress.error}
          </Text>
        )}

        {progress.stage === 'cancelled' && (
          <Text size="sm" c="orange" lh={rem(18)}>
            Comparison cancelled before completion.
          </Text>
        )}

        {progress.stage === 'completed' && (
          <Text size="sm" c="teal" lh={rem(18)}>
            Comparison finished successfully.
          </Text>
        )}

        <Group justify="flex-end">
          <Text size="xs" c="dimmed">
            Elapsed {elapsedLabel}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};
