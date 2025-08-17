import {
  Container,
  Title,
  Table,
  Button,
  Group,
  ActionIcon,
  Text,
  Stack,
  Paper,
  Badge,
  Tabs,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconDatabase,
  IconAlertCircle,
  IconTestPipe,
} from '@tabler/icons-react';
import { useState, useEffect } from 'react';

import { ConnectionConfig, ConnectionType } from '../../models/connections';
import { ConnectionsAPI } from '../../services/connections-api';
import { SecretMetadata } from '../../models/secrets';
import { SecretsAPI } from '../../services/secrets-api';

export function ConnectionsManager() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [secrets, setSecrets] = useState<Map<string, SecretMetadata>>(new Map());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [testingConnections, setTestingConnections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadConnections();
    loadSecrets();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const connectionsList = await ConnectionsAPI.listConnections();
      setConnections(connectionsList);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load connections';
      notifications.show({
        title: 'Error loading connections',
        message: msg,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSecrets = async () => {
    try {
      const secretsList = await SecretsAPI.listSecrets();
      const secretsMap = new Map();
      secretsList.forEach((secret) => {
        secretsMap.set(secret.id, secret);
      });
      setSecrets(secretsMap);
    } catch (error) {
      console.error('Failed to load secrets:', error);
    }
  };

  const handleDelete = async (connectionId: string) => {
    try {
      await ConnectionsAPI.deleteConnection(connectionId);
      notifications.show({
        title: 'Success',
        message: 'Connection deleted successfully',
        color: 'green',
      });
      loadConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete connection';
      notifications.show({
        title: 'Error',
        message,
        color: 'red',
      });
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    try {
      setTestingConnections((prev) => new Set(prev).add(connectionId));
      const result = await ConnectionsAPI.testDatabaseConnection(connectionId);
      
      notifications.show({
        title: result ? 'Test Successful' : 'Test Failed',
        message: result 
          ? 'Connection is working correctly' 
          : 'Connection test failed',
        color: result ? 'green' : 'red',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      notifications.show({
        title: 'Test Error',
        message: `Failed to test connection: ${message}`,
        color: 'red',
      });
    } finally {
      setTestingConnections((prev) => {
        const newSet = new Set(prev);
        newSet.delete(connectionId);
        return newSet;
      });
    }
  };

  const getConnectionTypeLabel = (type: ConnectionType): string => {
    return type === 'Postgres' ? 'PostgreSQL' : 'MySQL';
  };

  const getConnectionTypeColor = (type: ConnectionType): string => {
    return type === 'Postgres' ? 'blue' : 'orange';
  };

  const filteredConnections = connections.filter((connection) => {
    if (activeTab === 'all') return true;
    return connection.connection_type.toLowerCase() === activeTab;
  });

  return (
    <Container size="xl">
      <Stack gap={20}>
        <Group justify="space-between">
          <Title order={2}>Database Connections</Title>
          <Button leftSection={<IconPlus size={16} />} disabled>
            Add Connection
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          Manage your saved database connections. Use the datasource wizard to create new connections.
        </Text>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'all')}>
          <Tabs.List>
            <Tabs.Tab value="all">All ({connections.length})</Tabs.Tab>
            <Tabs.Tab value="postgres">
              PostgreSQL ({connections.filter((c) => c.connection_type === 'Postgres').length})
            </Tabs.Tab>
            <Tabs.Tab value="mysql">
              MySQL ({connections.filter((c) => c.connection_type === 'MySQL').length})
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={activeTab} pt="md">
            <Paper withBorder>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Host</Table.Th>
                    <Table.Th>Database</Table.Th>
                    <Table.Th>Secret</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading && (
                    <Table.Tr>
                      <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                        <Text c="dimmed">Loading connections...</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {!loading && filteredConnections.map((connection) => {
                    const secret = secrets.get(connection.secret_id);
                    const isTestingThis = testingConnections.has(connection.id);
                    
                    return (
                      <Table.Tr key={connection.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <IconDatabase size={16} />
                            <Text fw={500}>{connection.name}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getConnectionTypeColor(connection.connection_type)} size="sm">
                            {getConnectionTypeLabel(connection.connection_type)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" family="monospace">
                            {connection.host}:{connection.port}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" family="monospace">
                            {connection.database}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {secret ? (
                            <Text size="sm" c="dimmed">
                              {secret.name}
                            </Text>
                          ) : (
                            <Group gap="xs">
                              <IconAlertCircle size={14} color="orange" />
                              <Text size="sm" c="orange">
                                Secret not found
                              </Text>
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(connection.created_at).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              onClick={() => handleTestConnection(connection.id)}
                              loading={isTestingThis}
                              disabled={isTestingThis || !secret}
                              title={!secret ? 'Cannot test: secret not found' : 'Test connection'}
                            >
                              <IconTestPipe size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="blue"
                              disabled
                              title="Edit connection (coming soon)"
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => handleDelete(connection.id)}
                              title="Delete connection"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {!loading && filteredConnections.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                        <Text c="dimmed">
                          {activeTab === 'all'
                            ? 'No connections configured'
                            : `No ${getConnectionTypeLabel(activeTab as ConnectionType)} connections configured`}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}