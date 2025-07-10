import { showError, showSuccess } from '@components/app-notifications';
import { commonTextInputClassNames } from '@components/export-options-modal/constants';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Alert, Button, Group, PasswordInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { IconAlertCircle } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface HttpServerConfigProps {
  onBack: () => void;
  onClose: () => void;
  pool: AsyncDuckDBConnectionPool | null;
}

export function HttpServerConfig({ onBack, onClose, pool }: HttpServerConfigProps) {
  const [host, setHost] = useInputState('localhost');
  const [port, setPort] = useInputState('9999');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [authMethod, setAuthMethod] = useState<'none' | 'basic' | 'token'>('none');
  const [username, setUsername] = useInputState('');
  const [password, setPassword] = useInputState('');
  const [token, setToken] = useInputState('');
  const [databaseName, setDatabaseName] = useInputState('main');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    if (!pool) {
      showError({
        title: 'App not ready',
        message: 'Please wait for the app to initialize',
        autoClose: false,
      });
      return;
    }

    if (!host.trim() || !port.trim()) {
      showError({
        title: 'Validation error',
        message: 'Please enter both host and port',
        autoClose: false,
      });
      return;
    }

    setIsTesting(true);
    try {
      // TODO: Implement test connection logic
      console.log('Testing connection to:', { host, port, protocol, authMethod });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      showSuccess({
        title: 'Connection successful',
        message: 'DuckDB HTTP Server connection test passed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Connection failed',
        message: `Failed to connect: ${message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAdd = async () => {
    if (!pool) {
      showError({
        title: 'App not ready',
        message: 'Please wait for the app to initialize',
      });
      return;
    }

    if (!host.trim() || !port.trim() || !databaseName.trim()) {
      showError({
        title: 'Validation error',
        message: 'Please fill in all required fields',
        autoClose: false,
      });
      return;
    }

    setIsConnecting(true);
    try {
      // TODO: Implement add connection logic
      console.log('Adding HTTP server connection:', { host, port, protocol, authMethod, databaseName });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      showSuccess({
        title: 'Database added',
        message: `Successfully connected to HTTP server '${databaseName}'`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Failed to add database',
        message: `Error: ${message}`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to a DuckDB HTTP Server instance
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        Supports authentication methods: None, Basic Auth (username/password), Token Auth (API key)
      </Alert>

      <Stack gap={12}>
        <Group grow>
          <Select
            label="Protocol"
            value={protocol}
            onChange={(value) => setProtocol(value as 'http' | 'https')}
            data={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
            ]}
            description="Connection protocol"
            classNames={{
              label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
              input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
              description: 'pl-4 text-sm',
            }}
          />
          <TextInput
            label="Host"
            data-testid={setDataTestId('http-server-host-input')}
            placeholder="localhost"
            value={host}
            onChange={setHost}
            description="Server hostname or IP address"
            required
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
          />
          <TextInput
            label="Port"
            data-testid={setDataTestId('http-server-port-input')}
            placeholder="9999"
            value={port}
            onChange={setPort}
            description="Server port number"
            required
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
          />
        </Group>

        <TextInput
          label="Database Name"
          data-testid={setDataTestId('http-server-database-name-input')}
          placeholder="main"
          value={databaseName}
          onChange={setDatabaseName}
          description="Choose a name to reference this database in queries"
          required
          classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
        />

        <Select
          label="Authentication Method"
          value={authMethod}
          onChange={(value) => setAuthMethod(value as 'none' | 'basic' | 'token')}
          data={[
            { value: 'none', label: 'No Authentication' },
            { value: 'basic', label: 'Basic Auth (Username/Password)' },
            { value: 'token', label: 'Token Auth (API Key)' },
          ]}
          description="Select authentication method for the HTTP server"
          classNames={{
            label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
            input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
            description: 'pl-4 text-sm',
          }}
        />

        {authMethod === 'basic' && (
          <Group grow>
            <TextInput
              label="Username"
              data-testid={setDataTestId('http-server-username-input')}
              placeholder="username"
              value={username}
              onChange={setUsername}
              required
              classNames={commonTextInputClassNames}
            />
            <PasswordInput
              label="Password"
              data-testid={setDataTestId('http-server-password-input')}
              placeholder="password"
              value={password}
              onChange={setPassword}
              required
              classNames={{
                label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
                input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
              }}
            />
          </Group>
        )}

        {authMethod === 'token' && (
          <PasswordInput
            label="API Token"
            data-testid={setDataTestId('http-server-token-input')}
            placeholder="Enter API token"
            value={token}
            onChange={setToken}
            description="API key for token-based authentication"
            required
            classNames={{
              label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
              input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
              description: 'pl-4 text-sm',
            }}
          />
        )}
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" color="text-secondary" onClick={onBack}>
          Cancel
        </Button>
        <Button
          variant="light"
          color="background-accent"
          onClick={handleTest}
          loading={isTesting}
          disabled={!host.trim() || !port.trim() || isConnecting}
          data-testid={setDataTestId('test-http-server-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isConnecting}
          disabled={!host.trim() || !port.trim() || !databaseName.trim() || isTesting}
          color="background-accent"
          data-testid={setDataTestId('add-http-server-button')}
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}