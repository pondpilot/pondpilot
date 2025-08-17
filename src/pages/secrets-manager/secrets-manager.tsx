import {
  Container,
  Title,
  Table,
  Button,
  Group,
  Modal,
  TextInput,
  Select,
  PasswordInput,
  ActionIcon,
  Text,
  Alert,
  Stack,
  Paper,
  Badge,
  Tabs,
  Tooltip,
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconKey,
  IconDatabase,
  IconCloud,
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface Secret {
  id: string;
  name: string;
  secret_type: string;
  created_at: string;
  updated_at: string;
}

interface SecretCredentials {
  secret_type:
    | 'S3'
    | 'Azure'
    | 'GCS'
    | 'Huggingface'
    | 'MotherDuck'
    | 'R2'
    | 'Postgres'
    | 'MySQL'
    | 'HTTP'
    | 'DuckLake';
  name: string;
  // S3/R2 fields
  key_id?: string;
  secret?: string;
  region?: string;
  session_token?: string;
  endpoint?: string;
  use_ssl?: boolean;
  url_style?: string;
  // Azure fields
  account_name?: string;
  // API token fields
  token?: string;
  // Database fields - simplified for Postgres/MySQL to only store credentials
  username?: string;
  password?: string;
  // HTTP fields
  auth_type?: 'bearer' | 'basic';
  bearer_token?: string;
  basic_username?: string;
  basic_password?: string;
}

interface SecretTypeInfo {
  value: string;
  label: string;
  category: string;
  required_fields: string[];
  optional_fields: string[];
}

export function SecretsManager() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [secretTypes, setSecretTypes] = useState<SecretTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [formData, setFormData] = useState<Partial<SecretCredentials>>({
    secret_type: 'S3',
    use_ssl: true,
  });
  const [cleaningUp, setCleaningUp] = useState(false);

  useEffect(() => {
    loadSecrets();
    loadSecretTypes();
  }, []);

  const loadSecrets = async () => {
    try {
      setLoading(true);
      const response = await invoke<{ secrets: Secret[] }>('list_secrets', {});
      setSecrets(response.secrets);
    } catch (error) {
      console.error('Failed to load secrets:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load secrets',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSecretTypes = async () => {
    try {
      const types = await invoke<SecretTypeInfo[]>('get_secret_types');
      setSecretTypes(types);
    } catch (error) {
      console.error('Failed to load secret types:', error);
    }
  };

  const handleSave = async () => {
    try {
      if (editingSecret) {
        await invoke('update_secret', {
          request: {
            secret_id: editingSecret.id,
            name: formData.name,
            fields: {
              key_id: formData.key_id,
              secret: formData.secret,
              region: formData.region,
              session_token: formData.session_token,
              endpoint: formData.endpoint,
              account_name: formData.account_name,
              token: formData.token,
              username: formData.username,
              password: formData.password,
              bearer_token: formData.bearer_token,
              basic_username: formData.basic_username,
              basic_password: formData.basic_password,
            },
            tags: [],
          },
        });
        notifications.show({
          title: 'Success',
          message: 'Secret updated successfully',
          color: 'green',
        });
      } else {
        console.log('[Secrets UI] Creating new secret:', {
          type: formData.secret_type,
          name: formData.name,
          hasToken: !!formData.token,
          hasKeyId: !!formData.key_id,
          hasSecret: !!formData.secret,
        });

        const response = await invoke('save_secret', {
          request: {
            secret_type: formData.secret_type,
            name: formData.name || '',
            fields: {
              key_id: formData.key_id,
              secret: formData.secret,
              region: formData.region,
              session_token: formData.session_token,
              endpoint: formData.endpoint,
              account_name: formData.account_name,
              token: formData.token,
              username: formData.username,
              password: formData.password,
              bearer_token: formData.bearer_token,
              basic_username: formData.basic_username,
              basic_password: formData.basic_password,
            },
            tags: [],
            scope: null,
            description: null,
          },
        });

        console.log('[Secrets UI] Secret created successfully:', response);

        notifications.show({
          title: 'Success',
          message: 'Secret created successfully',
          color: 'green',
        });
      }
      setModalOpen(false);
      setEditingSecret(null);
      setFormData({
        secret_type: 'S3',
        use_ssl: true,
      });
      loadSecrets();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to save secret: ${error}`,
        color: 'red',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_secret', { secretId: id });
      notifications.show({
        title: 'Success',
        message: 'Secret deleted successfully',
        color: 'green',
      });
      loadSecrets();
    } catch (error: any) {
      console.error('Failed to delete secret:', error);
      notifications.show({
        title: 'Error',
        message: error.toString() || 'Failed to delete secret',
        color: 'red',
      });
    }
  };


  const handleCleanupOrphaned = async () => {
    try {
      setCleaningUp(true);
      const result = await invoke<string>('cleanup_orphaned_secrets');
      
      notifications.show({
        title: 'Cleanup Complete',
        message: result || 'No orphaned secrets found',
        color: 'green',
      });
      
      // Reload secrets to reflect any changes
      loadSecrets();
    } catch (error: any) {
      notifications.show({
        title: 'Cleanup Error',
        message: `Failed to cleanup orphaned secrets: ${error.toString()}`,
        color: 'red',
      });
    } finally {
      setCleaningUp(false);
    }
  };

  const getSecretTypeIcon = (type: string) => {
    switch (type) {
      case 'S3':
      case 'R2':
      case 'Azure':
      case 'GCS':
      case 'DuckLake':
        return <IconCloud size={16} />;
      case 'Postgres':
      case 'MySQL':
      case 'MotherDuck':
        return <IconDatabase size={16} />;
      case 'Huggingface':
      case 'HTTP':
        return <IconKey size={16} />;
      default:
        return <IconKey size={16} />;
    }
  };

  const getSecretCategory = (type: string): string => {
    switch (type) {
      case 'S3':
      case 'R2':
      case 'Azure':
      case 'GCS':
      case 'DuckLake':
        return 'cloud';
      case 'Postgres':
      case 'MySQL':
      case 'MotherDuck':
        return 'database';
      case 'Huggingface':
      case 'HTTP':
        return 'api';
      default:
        return 'all';
    }
  };

  const filteredSecrets = secrets.filter((secret) => {
    if (activeTab === 'all') return true;
    return getSecretCategory(secret.secret_type) === activeTab;
  });

  const renderFormFields = () => {
    const commonFields = (
      <>
        <TextInput
          label="Name"
          placeholder="Enter secret name"
          required
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </>
    );

    switch (formData.secret_type) {
      case 'S3':
        return (
          <>
            {commonFields}
            <TextInput
              label="Access Key ID"
              placeholder="Enter access key ID"
              required
              value={formData.key_id || ''}
              onChange={(e) => setFormData({ ...formData, key_id: e.target.value })}
            />
            <PasswordInput
              label="Secret Access Key"
              placeholder="Enter secret access key"
              required
              value={formData.secret || ''}
              onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            />
            <TextInput
              label="Region"
              placeholder="e.g., us-east-1"
              value={formData.region || ''}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            />
            <TextInput
              label="Session Token (Optional)"
              placeholder="For temporary credentials"
              value={formData.session_token || ''}
              onChange={(e) => setFormData({ ...formData, session_token: e.target.value })}
            />
            <TextInput
              label="Endpoint (Optional)"
              placeholder="Custom S3 endpoint"
              value={formData.endpoint || ''}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            />
          </>
        );
      case 'Azure':
        return (
          <>
            {commonFields}
            <TextInput
              label="Account Name"
              placeholder="Enter storage account name"
              required
              value={formData.account_name || ''}
              onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            />
            <PasswordInput
              label="Access Key"
              placeholder="Enter access key"
              required
              value={formData.secret || ''}
              onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            />
          </>
        );
      case 'GCS':
        return (
          <>
            {commonFields}
            <TextInput
              label="Access Key ID"
              placeholder="Enter access key ID"
              required
              value={formData.key_id || ''}
              onChange={(e) => setFormData({ ...formData, key_id: e.target.value })}
            />
            <PasswordInput
              label="Secret"
              placeholder="Enter secret"
              required
              value={formData.secret || ''}
              onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            />
          </>
        );
      case 'R2':
        return (
          <>
            {commonFields}
            <TextInput
              label="Account ID"
              placeholder="Enter Cloudflare account ID"
              required
              value={formData.key_id || ''}
              onChange={(e) => setFormData({ ...formData, key_id: e.target.value })}
            />
            <PasswordInput
              label="Access Key Secret"
              placeholder="Enter R2 access key secret"
              required
              value={formData.secret || ''}
              onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            />
            <TextInput
              label="Endpoint (Optional)"
              placeholder="Custom R2 endpoint"
              value={formData.endpoint || ''}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            />
          </>
        );
      case 'MotherDuck':
        return (
          <>
            {commonFields}
            <PasswordInput
              label="API Token"
              placeholder="Enter MotherDuck API token"
              required
              value={formData.token || ''}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            />
          </>
        );
      case 'DuckLake':
        return (
          <>
            {commonFields}
            <PasswordInput
              label="API Token"
              placeholder="Enter DuckLake API token"
              required
              value={formData.token || ''}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            />
          </>
        );
      case 'Postgres':
        return (
          <>
            {commonFields}
            <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light" mb="sm">
              <Text size="sm">
                PostgreSQL secrets now only store authentication credentials. Connection details 
                (host, port, database) are configured when creating database connections.
              </Text>
            </Alert>
            <TextInput
              label="Username"
              placeholder="Database username"
              required
              value={formData.username || ''}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <PasswordInput
              label="Password"
              placeholder="Database password"
              required
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </>
        );
      case 'MySQL':
        return (
          <>
            {commonFields}
            <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light" mb="sm">
              <Text size="sm">
                MySQL secrets now only store authentication credentials. Connection details 
                (host, port, database) are configured when creating database connections.
              </Text>
            </Alert>
            <TextInput
              label="Username"
              placeholder="Database username"
              required
              value={formData.username || ''}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <PasswordInput
              label="Password"
              placeholder="Database password"
              required
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </>
        );
      case 'HTTP':
        return (
          <>
            {commonFields}
            <Select
              label="Authentication Type"
              placeholder="Select auth type"
              required
              value={formData.auth_type || 'bearer'}
              onChange={(value) =>
                setFormData({ ...formData, auth_type: value as 'bearer' | 'basic' })
              }
              data={[
                { value: 'bearer', label: 'Bearer Token' },
                { value: 'basic', label: 'Basic Auth' },
              ]}
            />
            {formData.auth_type === 'bearer' ? (
              <PasswordInput
                label="Bearer Token"
                placeholder="Enter bearer token"
                required
                value={formData.bearer_token || ''}
                onChange={(e) => setFormData({ ...formData, bearer_token: e.target.value })}
              />
            ) : (
              <>
                <TextInput
                  label="Username"
                  placeholder="Enter username"
                  required
                  value={formData.basic_username || ''}
                  onChange={(e) => setFormData({ ...formData, basic_username: e.target.value })}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Enter password"
                  required
                  value={formData.basic_password || ''}
                  onChange={(e) => setFormData({ ...formData, basic_password: e.target.value })}
                />
              </>
            )}
          </>
        );
      case 'Huggingface':
        return (
          <>
            {commonFields}
            <PasswordInput
              label="API Token"
              placeholder="Enter Hugging Face API token"
              required
              value={formData.token || ''}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            />
          </>
        );
      default:
        return commonFields;
    }
  };

  return (
    <Container
      size="lg"
      py="xl"
      style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-body)' }}
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>
            <Group gap="xs">
              <IconKey size={28} />
              Secrets Manager
            </Group>
          </Title>
          <Group gap="sm">
            <Tooltip label="Remove secrets that are no longer in use">
              <Button
                variant="light"
                color="orange"
                leftSection={cleaningUp ? <Loader size={16} /> : <IconRefresh size={16} />}
                onClick={handleCleanupOrphaned}
                loading={cleaningUp}
                disabled={cleaningUp}
              >
                Cleanup Orphaned
              </Button>
            </Tooltip>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setEditingSecret(null);
                setFormData({
                  secret_type: 'S3',
                  use_ssl: true,
                });
                setModalOpen(true);
              }}
            >
              Add Secret
            </Button>
          </Group>
        </Group>

        <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
          <Text size="sm">
            Secrets are stored securely in your system's keychain and automatically injected into
            DuckDB connections. They enable seamless access to cloud storage and remote data
            sources.
          </Text>
        </Alert>

        <Paper shadow="xs" p="md" withBorder>
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'all')}>
            <Tabs.List>
              <Tabs.Tab value="all">
                All Secrets {secrets.length > 0 && `(${secrets.length})`}
              </Tabs.Tab>
              <Tabs.Tab value="cloud">
                Cloud Storage{' '}
                {secrets.filter((s) => getSecretCategory(s.secret_type) === 'cloud').length > 0 &&
                  `(${secrets.filter((s) => getSecretCategory(s.secret_type) === 'cloud').length})`}
              </Tabs.Tab>
              <Tabs.Tab value="database">
                Databases{' '}
                {secrets.filter((s) => getSecretCategory(s.secret_type) === 'database').length >
                  0 &&
                  `(${secrets.filter((s) => getSecretCategory(s.secret_type) === 'database').length})`}
              </Tabs.Tab>
              <Tabs.Tab value="api">
                API Keys{' '}
                {secrets.filter((s) => getSecretCategory(s.secret_type) === 'api').length > 0 &&
                  `(${secrets.filter((s) => getSecretCategory(s.secret_type) === 'api').length})`}
              </Tabs.Tab>
            </Tabs.List>

            <Table striped highlightOnHover mt="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredSecrets.map((secret) => (
                  <Table.Tr key={secret.id}>
                    <Table.Td>
                      <Badge leftSection={getSecretTypeIcon(secret.secret_type)} variant="light">
                        {secret.secret_type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{secret.name}</Table.Td>
                    <Table.Td>{new Date(secret.created_at).toLocaleDateString()}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Edit secret">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => {
                              setEditingSecret(secret);
                              setFormData(secret as any);
                              setModalOpen(true);
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete secret">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(secret.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {filteredSecrets.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4} style={{ textAlign: 'center' }}>
                      <Text c="dimmed">
                        {activeTab === 'all'
                          ? 'No secrets configured'
                          : `No ${activeTab} secrets configured`}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Tabs>
        </Paper>
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSecret ? 'Edit Secret' : 'Add New Secret'}
        size="md"
      >
        <Stack>
          <Select
            label="Secret Type"
            placeholder="Select secret type"
            required
            disabled={!!editingSecret}
            value={formData.secret_type}
            onChange={(value) => setFormData({ ...formData, secret_type: value as any })}
            data={secretTypes.map((type) => ({ value: type.value, label: type.label }))}
          />
          {renderFormFields()}
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingSecret ? 'Update' : 'Create'} Secret</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
