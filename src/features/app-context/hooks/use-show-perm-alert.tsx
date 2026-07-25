import { showAlert } from '@components/app-notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';

export const useShowPermsAlert = () => {
  const showPermsAlert = useCallback(
    (): Promise<boolean> =>
      new Promise((resolve) => {
        const alert = showAlert({
          title: 'Allow File Access',
          withCloseButton: false,
          autoClose: false,
          message: (
            <Stack className="pt-3">
              <Text c="text-contrast">
                Enable access to previously uploaded files to continue.
                <br />
                If the message persists after reloading, grant permanent access in your browser tab
                settings.
              </Text>
              <Group justify="end">
                <Button
                  variant="transparent"
                  onClick={() => {
                    notifications.hide(alert);
                    resolve(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    notifications.hide(alert);
                    resolve(true);
                  }}
                >
                  Allow
                </Button>
              </Group>
            </Stack>
          ),
        });
      }),
    [],
  );

  return { showPermsAlert };
};
