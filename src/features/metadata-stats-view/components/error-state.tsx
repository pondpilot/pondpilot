import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import React from 'react';

interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

export const ErrorState = React.memo(({ error, onRetry }: ErrorStateProps) => {
  return (
    <Box p="md" className="bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark h-full">
      <Group justify="center" className="h-full">
        <Stack align="center" gap="md">
          <IconAlertTriangle size={48} className="text-yellow-500" />
          <Stack align="center" gap="xs">
            <Text fw={500} size="lg">
              Unable to load metadata statistics
            </Text>
            <Text c="dimmed" size="sm" ta="center" maw={400}>
              {error.message}
            </Text>
          </Stack>
          {onRetry && (
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={onRetry}
              variant="light"
              size="sm"
            >
              Try Again
            </Button>
          )}
        </Stack>
      </Group>
    </Box>
  );
});

ErrorState.displayName = 'ErrorState';
