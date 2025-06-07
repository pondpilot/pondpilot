import { Modal, Stack, Text } from '@mantine/core';

// eslint-disable-next-line import/no-cycle
import { useDuckDBInitializerStatus } from '@features/duckdb-context/duckdb-context';

export const DevModal = () => {
  const { state: dbInitState, message } = useDuckDBInitializerStatus();

  return dbInitState !== 'ready' ? (
    <Modal size="lg" opened onClose={() => {}} withCloseButton={false} centered>
      <Stack align="center" gap="md" py="lg">
        <Text size="lg" mb="sm">
          DuckDB init progress
        </Text>
        <Text size="sm" c="dimmed">
          {dbInitState === 'error' ? 'DuckDB Failed to initialize' : message}
        </Text>
      </Stack>
    </Modal>
  ) : undefined;
};
