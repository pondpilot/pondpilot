import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { resetAppState } from '@store/app-store';

export const ClearDataSection = () => {
  const [confirmOpened, { open: openConfirm, close: onConfirmClose }] = useDisclosure(false);

  const handleClearData = async () => {
    await resetAppState();
    onConfirmClose();
  };

  return (
    <>
      <Modal
        opened={confirmOpened}
        onClose={onConfirmClose}
        title={
          <Title c="text-primary" order={3}>
            Clear all app data
          </Title>
        }
      >
        <Text c="text-secondary" mb="md">
          Are you sure you want to clear all app data? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="outline" onClick={onConfirmClose}>
            Cancel
          </Button>
          <Button color="text-error" onClick={handleClearData}>
            Clear all data
          </Button>
        </Group>
      </Modal>

      <Stack>
        <Button className="w-fit" onClick={openConfirm} variant="outline" color="text-error">
          Clear all
        </Button>
      </Stack>
    </>
  );
};
