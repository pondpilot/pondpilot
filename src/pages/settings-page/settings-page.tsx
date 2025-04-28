import { ActionIcon, Box, Button, Divider, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { exportSQLScripts } from '@controllers/export-data';
import { resetAppState } from '@store/app-store';
import { useDisclosure } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from './components/theme-switcher';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const [confirmOpened, { open: openConfirm, close: onConfirmClose }] = useDisclosure(false);

  const handleClearData = async () => {
    await resetAppState();
    onConfirmClose();
  };

  const downloadArchive = async () => {
    const archiveBlob = await exportSQLScripts();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'queries.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
      <Group
        align="start"
        justify="center"
        className="h-full p-4 overflow-auto"
        data-testid={setDataTestId('settings-page')}
      >
        <Stack w={700} className="gap-8">
          <Title c="text-primary" order={2}>
            Appearance
          </Title>
          <Stack>
            <Box>
              <Title c="text-primary" order={3}>
                Theme
              </Title>
              <Text c="text-secondary">
                Customize how the app looks. Choose a theme or sync with your system.
              </Text>
            </Box>

            <ThemeSwitcher />
          </Stack>
          <Divider />
          <Stack className="gap-8">
            <Title c="text-primary" order={2}>
              Saved data
            </Title>
            <Stack>
              <Box>
                <Title c="text-primary" order={3}>
                  Export queries
                </Title>
                <Stack>
                  <Text c="text-secondary">Export all queries to a single ZIP archive.</Text>
                  <Button
                    className="w-fit"
                    onClick={downloadArchive}
                    variant="outline"
                    color="background-accent"
                  >
                    Export All
                  </Button>
                </Stack>
              </Box>
            </Stack>
            <Stack>
              <Box>
                <Title c="text-primary" order={3}>
                  Clear app data
                </Title>
                <Stack>
                  <Text c="text-secondary">
                    This action will permanently delete all saved queries and uploaded files. This
                    cannot be undone.
                  </Text>
                  <Button className="w-fit" onClick={openConfirm} variant="outline" color="red">
                    Clear all
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Stack>
        <Stack>
          <ActionIcon
            data-testid={setDataTestId('settings-page-close-button')}
            onClick={() => navigate('/')}
          >
            <IconX />
          </ActionIcon>
        </Stack>
      </Group>
    </>
  );
};
