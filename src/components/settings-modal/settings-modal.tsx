import { useAppNotifications } from '@components/app-notifications';
import { useAppContext } from '@features/app-context';
import { Text, Modal, Stack, Button, Group } from '@mantine/core';
import { openDB } from 'idb';
import { FILE_HANDLE_DB_NAME, FILE_HANDLE_STORE_NAME } from '../../consts';
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
  const { exportFilesAsArchive } = useAppContext();
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
    const archiveBlob = await exportFilesAsArchive();
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
    try {
      const db = await openDB(FILE_HANDLE_DB_NAME, 1, {
        upgrade: (d) => d.createObjectStore(FILE_HANDLE_STORE_NAME),
      });
      const handles = await db.getAll(FILE_HANDLE_STORE_NAME);
      await Promise.all(handles.map((handle) => handle.requestPermission({ mode: 'read' })));
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showError({ title: 'Error restoring files', message });
    }
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
