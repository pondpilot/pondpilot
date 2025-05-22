import { Group, Loader, Progress, Stack, Text } from '@mantine/core';
import React from 'react';

interface LoadingStateProps {
  progress?: { current: number; total: number } | null;
}

export const LoadingState = React.memo(({ progress }: LoadingStateProps) => {
  const progressPercentage = progress ? (progress.current / progress.total) * 100 : 0;

  return (
    <Group
      justify="center"
      py="xl"
      className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
    >
      <Stack align="center" gap="md" style={{ width: '300px' }}>
        <Loader />
        <Text>Loading metadata statistics...</Text>
        {progress && (
          <>
            <Progress value={progressPercentage} size="sm" style={{ width: '100%' }} color="blue" />
            <Text size="xs" c="dimmed">
              Processing {progress.current} of {progress.total} columns (
              {Math.round(progressPercentage)}%)
            </Text>
          </>
        )}
      </Stack>
    </Group>
  );
});

LoadingState.displayName = 'LoadingState';
