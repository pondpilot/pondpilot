import { useIsTauri } from '@hooks/use-is-tauri';
import { Stack, Title, Text, Button } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import React from 'react';

export const SecretsSettings = () => {
  const isTauri = useIsTauri();

  // Only show in Tauri environment
  if (!isTauri) {
    return null;
  }

  const handleOpenSecretsManager = async () => {
    try {
      await invoke('open_secrets_window');
    } catch (error) {
      console.error('Failed to open secrets window:', error);
    }
  };

  return (
    <Stack className="gap-8">
      <Title c="text-primary" order={2}>
        Secrets Management
      </Title>

      <Stack>
        <Text c="text-secondary" mb="md">
          Manage your database credentials and API keys securely using your system keychain.
          Credentials are stored encrypted and never leave your device.
        </Text>

        <Button
          leftSection={<IconKey size={20} />}
          onClick={handleOpenSecretsManager}
          variant="light"
          size="md"
        >
          Open Secrets Manager
        </Button>
      </Stack>
    </Stack>
  );
};
