import { useAppNotifications } from '@components/app-notifications';
import { Text, Modal, Stack, Button, Group } from '@mantine/core';
import { exportQueryFiles } from '@utils/exportData';
import { clearFileSystem } from './utils';

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirmOpen: () => void;
  confirmOpened: boolean;
  onConfirmClose: () => void;
}

export const SettingsModal = ({
  opened,
  onClose,
  confirmOpened,
  onConfirmOpen,
  onConfirmClose,
}: SettingsModalProps) => {
  const { showError } = useAppNotifications();

  const onClearClick = () => {
    onClose();
    onConfirmOpen();
  };

  const handleClearData = () => {
    clearFileSystem();
    onConfirmClose();
  };

  const downloadArchive = async () => {
    const archiveBlob = await exportQueryFiles();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'session_files.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleRestoreFiles = async () => {
    // TODO: Implement file restore from idb
  };

  return (
    <>
      <Modal
        opened={confirmOpened}
        onClose={onConfirmClose}
        withCloseButton={false}
        centered
        keepMounted={false}
      >
        <Text size="sm" mb="md">
          Are you sure you want to clear all app data? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onConfirmClose}>
            Cancel
          </Button>
          <Button color="red" onClick={handleClearData}>
            Confirm
          </Button>
        </Group>
      </Modal>
      <Modal
        classNames={{
          content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
          header: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        }}
        opened={opened}
        onClose={onClose}
        title="App settings"
        centered
        keepMounted={false}
      >
        <Stack className=" justify-between">
          <Stack align="start">
            <Button variant="outline" onClick={handleRestoreFiles}>
              Restore files
            </Button>
            <Button variant="outline" onClick={downloadArchive}>
              Export queries
            </Button>
            <Button className="w-fit" onClick={onClearClick} variant="outline" color="red">
              Clear app data
            </Button>
          </Stack>
          <Stack>
            <Text c="text-primary">🌈 Version: {__VERSION__}</Text>
          </Stack>
        </Stack>
      </Modal>
    </>
  );
};
