import { useIsTauri } from '@hooks/use-is-tauri';
import { Stack, Title, Text, Button } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import React, { useState } from 'react';

import { ConnectionsManager } from '../../connections-manager/connections-manager';

export const ConnectionsSettings = () => {
  const isTauri = useIsTauri();
  const [showConnectionsManager, setShowConnectionsManager] = useState(false);

  // Only show in Tauri environment
  if (!isTauri) {
    return null;
  }

  if (showConnectionsManager) {
    return (
      <Stack className="gap-8">
        <Button
          variant="subtle"
          onClick={() => setShowConnectionsManager(false)}
          size="sm"
          style={{ alignSelf: 'flex-start' }}
        >
          ← Back to Settings
        </Button>
        <ConnectionsManager />
      </Stack>
    );
  }

  return (
    <Stack className="gap-8">
      <Title c="text-primary" order={2}>
        Database Connections
      </Title>

      <Stack>
        <Text c="text-secondary" mb="md">
          Manage your saved database connections. View, test, and delete PostgreSQL and MySQL
          connections created through the datasource wizard.
        </Text>

        <Text c="text-secondary" mb="lg">
          Connection configurations are stored separately from credentials for better security.
        </Text>

        <Button
          leftSection={<IconDatabase size={16} />}
          onClick={() => setShowConnectionsManager(true)}
          variant="default"
          style={{ alignSelf: 'flex-start' }}
        >
          Manage Connections
        </Button>
      </Stack>
    </Stack>
  );
};
