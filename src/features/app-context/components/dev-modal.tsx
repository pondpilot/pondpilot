import { useDuckDBInitializerStatus } from '@features/duckdb-context/duckdb-context';
import { Modal, Stack, Text } from '@mantine/core';

export const DevModal = () => {
  const { state: dbInitState, message } = useDuckDBInitializerStatus();

  return dbInitState !== 'ready' ? (
    <Modal size="lg" opened onClose={() => {}} withCloseButton={false} centered>
      <Stack align="center" gap="md" py="lg">
        <Text size="lg" mb="sm">
          DuckDB init progress
        </Text>
        <Text size="sm" c="text-secondary">
          {dbInitState === 'error' ? 'DuckDB Failed to initialize' : message}
        </Text>
      </Stack>
    </Modal>
  ) : undefined;
};
