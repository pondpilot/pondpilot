import { ErrorStackView } from '@components/error-stack-view';
import { deleteTab } from '@controllers/tab';
import { Button, List, Stack, Text, ThemeIcon } from '@mantine/core';
import { TabId } from '@models/tab';
import { IconRefresh, IconDownload } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import React from 'react';
import { useRouteError } from 'react-router-dom';

export const TabErrorFallback = ({ tabId }: { tabId: TabId | null }) => {
  const error = useRouteError() as Error;
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
              <ThemeIcon color="blue" size={24} radius="xl">
                <IconRefresh size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>1. Try reloading the page first</Text>
            <Text c="dimmed" size="sm" mt={4}>
              This may resolve temporary issues
            </Text>
            <Button onClick={window.location.reload} mt="xs" variant="light">
              Reload page
            </Button>
          </List.Item>

          <List.Item
            icon={
              <ThemeIcon color="blue" size={24} radius="xl">
                <IconDownload size={16} />
              </ThemeIcon>
            }
          >
            <Text fw={500}>2. If the error persists, close the tab</Text>
            <Text c="dimmed" size="sm" mt={4}>
              This will delete the the tab
            </Text>
            <Button onClick={() => tabId && deleteTab([tabId])} mt="xs">
              Close the tab
            </Button>
          </List.Item>
        </List>
      </Stack>
    </div>
  );
};
