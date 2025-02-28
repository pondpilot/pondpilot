import { Group, Modal, Text } from '@mantine/core';
import { IconCircleXFilled } from '@tabler/icons-react';

interface ErrorModalProps {
  opened: boolean;
  onClose: () => void;
  errorText: string;
}

export const ErrorModal = ({ opened, onClose, errorText }: ErrorModalProps) => (
  <Modal
    size="lg"
    opened={opened}
    onClose={onClose}
    withCloseButton
    centered
    title={
      <Group className="gap-3">
        <IconCircleXFilled className="text-magenta-700" />
        <Text c="text-primary" className="font-medium">
          Failed to run query
        </Text>
      </Group>
    }
    keepMounted={false}
    classNames={{
      content: 'rounded-lg',
      body: 'px-[52px]',
    }}
  >
    <Text size="xs" mb="md" className="font-mono">
      <pre className="whitespace-pre-wrap">{errorText}</pre>
    </Text>
  </Modal>
);
