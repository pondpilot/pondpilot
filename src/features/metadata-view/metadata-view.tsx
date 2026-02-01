import { Center, Stack, Text } from '@mantine/core';
import { IconTableColumn } from '@tabler/icons-react';

/**
 * Metadata view displays column-level statistics and distributions
 * for the current dataset.
 */
export const MetadataView = () => {
  return (
    <Center className="h-full">
      <Stack align="center" gap="xs">
        <IconTableColumn size={32} stroke={1} />
        <Text size="sm" c="dimmed">
          Metadata view coming soon
        </Text>
      </Stack>
    </Center>
  );
};
