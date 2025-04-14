import { LoadingOverlay } from '@components/loading-overlay';
import { Stack, Loader, Button, Text } from '@mantine/core';

interface LoadingContentProps {
  title: string;
  onCancel: () => void;
  visible: boolean;
}

export const TableLoadingOverlay = ({ onCancel, visible, title }: LoadingContentProps) => (
  <LoadingOverlay visible={visible}>
    <Stack align="center" gap={4} bg="background-primary" className="p-8 pt-4 rounded-2xl">
      <Loader size={24} color="text-secondary" />
      <Text c="text-primary" className="text-2xl font-medium">
        {title}
      </Text>
      <span className="text-textSecondary-light dark:text-textSecondary-dark font-medium">
        Press{' '}
        <Button
          c="text-primary"
          onClick={onCancel}
          className="bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark hover:bg-backgroundTertiary-light dark:hover:bg-backgroundTertiary-dark"
        >
          Cancel
        </Button>{' '}
        or ⌥ Q to abort processing
      </span>
    </Stack>
  </LoadingOverlay>
);
