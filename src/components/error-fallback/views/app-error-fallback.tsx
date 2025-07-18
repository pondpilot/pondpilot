import { ErrorStackView } from '@components/error-stack-view';
import { exportSQLScripts } from '@controllers/export-data';
import { Stack, Button, Text, Anchor, List, ThemeIcon, Box } from '@mantine/core';
import { APP_SUPPORT_URL } from '@models/app-urls';
import { IconCircleCheck, IconRefresh, IconDownload, IconTrash } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';
import { useRouteError } from 'react-router-dom';

import { deleteApplicationData } from '../utils';

export const AppErrorFallback = () => {
  const [exportError, setExportError] = useState<boolean>(false);
  const error = useRouteError() as Error;

  // Handlers
  const exportArchive = async () => {
    const archiveBlob = await exportSQLScripts();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'application_files.zip';
      link.click();
    } else {
      setExportError(true);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div role="alert" data-testid={setDataTestId('error-fallback')}>
      <Stack p="lg">
        <Text size="xl" fw={700}>
          Something went wrong 🤷‍♂️
        </Text>

        <ErrorStackView error={error} />

        <Text size="xl" fw={700}>
          Follow these steps to recover:
        </Text>

        <List type="ordered" spacing="lg">
          <List.Item
            icon={
              <ThemeIcon color="background-accent" size={24} radius="xl">
                <IconRefresh size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>1. Try reloading the page first</Text>
            <Text c="text-secondary" size="sm" mt={4}>
              This may resolve temporary issues
            </Text>
            <Button onClick={handleReload} mt="xs" variant="light" color="background-accent">
              Reload page
            </Button>
          </List.Item>

          <List.Item
            icon={
              <ThemeIcon color="background-accent" size={24} radius="xl">
                <IconDownload size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>2. If the error persists, export your queries</Text>
            <Text c="text-secondary" size="sm" mt={4}>
              This will save all your SQL scripts as a ZIP archive
            </Text>
            <Button
              onClick={exportArchive}
              mt="xs"
              disabled={exportError}
              color="background-accent"
            >
              Export SQL scripts
            </Button>
            {exportError && (
              <Box bg="red.0" p="md" mt="md" style={{ borderRadius: '8px' }}>
                <Text c="red" fw={500}>
                  Unfortunately, export failed. This means that PondPilot won&apos;t be able to
                  restore your scripts. We are really sorry for this inconvenience.
                </Text>
                <Text mt="sm">
                  Please contact us via{' '}
                  <Anchor href={APP_SUPPORT_URL} target="_blank">
                    support
                  </Anchor>{' '}
                  and we will do our best to help you recover your data.
                </Text>
              </Box>
            )}
          </List.Item>

          <List.Item
            icon={
              <ThemeIcon color="text-error" size={24} radius="xl">
                <IconTrash size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>3. Clear application data</Text>
            <Text c="text-secondary" size="sm" mt={4}>
              After exporting, clear all data
            </Text>
            <Button variant="outline" color="text-error" onClick={deleteApplicationData} mt="xs">
              Delete application data
            </Button>
          </List.Item>

          <List.Item
            icon={
              <ThemeIcon color="background-accent" size={24} radius="xl">
                <IconRefresh size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>4. Reload the page again</Text>
            <Text c="text-secondary" size="sm" mt={4}>
              After clearing data, reload to start fresh
            </Text>
            <Button onClick={handleReload} mt="xs" variant="light" color="background-accent">
              Reload page
            </Button>
          </List.Item>

          <List.Item
            icon={
              <ThemeIcon color="green" size={24} radius="xl">
                <IconCircleCheck size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>5. Import scripts</Text>
            <Text c="text-secondary" size="sm" mt={4}>
              After reloading, use the script import feature to restore from the ZIP file
            </Text>
          </List.Item>
        </List>
      </Stack>
    </div>
  );
};
