import { Box, Group, Stack, Text } from '@mantine/core';
import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
}

export const EmptyState = React.memo(({ title, description }: EmptyStateProps) => {
  return (
    <Box p="md" className="bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark h-full">
      <Group justify="center" className="h-full">
        <Stack align="center" gap="md">
          <Text c="dimmed" size="lg">
            {title}
          </Text>
          <Text c="dimmed" size="sm" ta="center">
            {description}
          </Text>
        </Stack>
      </Group>
    </Box>
  );
});

EmptyState.displayName = 'EmptyState';
