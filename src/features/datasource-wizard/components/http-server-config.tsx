import { showError, showSuccess } from '@components/app-notifications';
import { commonTextInputClassNames } from '@components/export-options-modal/constants';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Alert, Button, Group, Select, Stack, Text, TextInput, PasswordInput } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { PersistentDataSourceId } from '@models/data-source';
import { DBColumnId } from '@models/db';
import { useAppStore } from '@store/app-store';
import { IconShield } from '@tabler/icons-react';
import { createHttpClient } from '@utils/duckdb-http-client';
import { saveHTTPServerCredentials } from '@utils/httpserver-credentials';
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
  const [databaseName, setDatabaseName] = useInputState('main');
  const [authType, setAuthType] = useState<'none' | 'basic' | 'token'>('none');
  const [username, setUsername] = useInputState('');
  const [password, setPassword] = useInputState('');
  const [token, setToken] = useInputState('');
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
      const client = createHttpClient({
        host: host.trim(),
        port: parseInt(port.trim(), 10),
        protocol,
        authType,
        username: authType === 'basic' ? username.trim() : undefined,
        password: authType === 'basic' ? password.trim() : undefined,
        token: authType === 'token' ? token.trim() : undefined,
      });

      const isConnected = await client.testConnection();

      if (isConnected) {
        showSuccess({
          title: 'Connection successful',
          message: 'DuckDB HTTP Server connection test passed',
        });
      } else {
        throw new Error('Connection test failed');
      }
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
      const client = createHttpClient({
        host: host.trim(),
        port: parseInt(port.trim(), 10),
        protocol,
        authType,
        username: authType === 'basic' ? username.trim() : undefined,
        password: authType === 'basic' ? password.trim() : undefined,
        token: authType === 'token' ? token.trim() : undefined,
      });

      // Test connection first
      const isConnected = await client.testConnection();

      if (!isConnected) {
        throw new Error('Connection test failed');
      }

      // Get schema to verify database is accessible
      const schema = await client.getSchema();

      // Check for database name conflicts
      const { dataSources, databaseMetadata } = useAppStore.getState();
      const dbName = databaseName.trim();

      // Check for potential view name conflicts with existing HTTPServer databases
      const existingHTTPServerDatabases = Array.from(dataSources.values()).filter(
        (dataSource) => dataSource.type === 'httpserver-db',
      );

      for (const table of schema.tables) {
        const proposedViewName = `httpserver_${dbName.replace(/[-]/g, '_')}_${table.name.replace(/[-]/g, '_')}`;

        // Check if any existing HTTPServer DB would create the same view name
        for (const existingDb of existingHTTPServerDatabases) {
          if (existingDb.type === 'httpserver-db') {
            const existingViewName = `httpserver_${existingDb.dbName.replace(/[-]/g, '_')}_${table.name.replace(/[-]/g, '_')}`;
            if (proposedViewName === existingViewName) {
              throw new Error(
                `View name conflict: Table '${table.name}' would create the same view name as existing HTTPServer database '${existingDb.dbName}'. Please choose a different database name.`,
              );
            }
          }
        }
      }

      // Check if database name already exists in metadata
      if (databaseMetadata.has(dbName)) {
        throw new Error(
          `Database name '${dbName}' already exists. Please choose a different name.`,
        );
      }

      // Check if any existing HTTPServerDB uses the same connection parameters
      const hostTrimmed = host.trim();
      const portTrimmed = port.trim();

      const existingHTTPServerDB = Array.from(dataSources.values()).find(
        (dataSource) =>
          dataSource.type === 'httpserver-db' &&
          ((dataSource as any).dbName === dbName ||
            ((dataSource as any).host === hostTrimmed &&
              (dataSource as any).port === parseInt(portTrimmed, 10))),
      );

      if (existingHTTPServerDB) {
        const httpServerDb = existingHTTPServerDB as any;
        if (httpServerDb.dbName === dbName) {
          throw new Error(
            `HTTPServer database with name '${dbName}' already exists. Please choose a different name.`,
          );
        } else {
          throw new Error(
            `HTTPServer connection to ${hostTrimmed}:${portTrimmed} already exists with database name '${httpServerDb.dbName}'.`,
          );
        }
      }

      // Create HTTPServerDB data source with deterministic ID
      const httpServerDb = {
        type: 'httpserver-db' as const,
        id: `httpserver-${hostTrimmed}-${portTrimmed}-${dbName}` as PersistentDataSourceId,
        host: hostTrimmed,
        port: parseInt(portTrimmed, 10),
        dbName,
        authType,
        connectionState: 'connected' as const,
        attachedAt: Date.now(),
        comment: `HTTP Server at ${protocol}://${hostTrimmed}:${portTrimmed}`,
      };

      // Save credentials separately for security
      if (authType === 'basic' && username.trim() && password.trim()) {
        saveHTTPServerCredentials(httpServerDb.id, {
          username: username.trim(),
          password: password.trim(),
        });
      } else if (authType === 'token' && token.trim()) {
        saveHTTPServerCredentials(httpServerDb.id, { token: token.trim() });
      }

      // Convert HTTP Server schema to DataBaseModel format
      const databaseModel = {
        name: httpServerDb.dbName,
        schemas: [
          {
            name: 'main',
            objects: schema.tables.map((table) => ({
              name: table.name,
              label: table.name,
              type: 'table' as const,
              columns: table.columns.map((col, index) => ({
                name: col.name,
                databaseType: col.type,
                nullable: col.nullable,
                sqlType: 'string' as const, // Default to string for HTTP server columns
                id: `col-${table.name}-${col.name}-${index}` as DBColumnId,
                columnIndex: index,
              })),
            })),
          },
        ],
      };

      // Add to app store (reuse existing variables)
      const newDataSources = new Map(dataSources);
      const newDatabaseMetadata = new Map(databaseMetadata);

      newDataSources.set(httpServerDb.id, httpServerDb);
      newDatabaseMetadata.set(httpServerDb.dbName, databaseModel);

      useAppStore.setState(
        {
          dataSources: newDataSources,
          databaseMetadata: newDatabaseMetadata,
        },
        false,
        'HTTPServerDB/add',
      );

      // Persist to IndexedDB
      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        await persistPutDataSources(_iDbConn, [httpServerDb]);
      }

      showSuccess({
        title: 'Database added',
        message: `Successfully connected to HTTP server '${databaseName}' (${schema.tables.length} tables found)`,
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
        icon={<IconShield size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        {authType === 'none'
          ? 'Direct connection to DuckDB HTTP Server (No Authentication)'
          : authType === 'basic'
            ? 'Basic Authentication (Username/Password)'
            : 'Token Authentication (API Key)'}
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
              input:
                'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
              description: 'pl-4 text-sm',
            }}
          />
          <TextInput
            label="Host"
            data-testid={setDataTestId('http-server-host-input')}
            placeholder="localhost"
            value={host}
            onChange={setHost}
            description="Hostname or IP address"
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

        <Select
          label="Authentication"
          data-testid={setDataTestId('http-server-auth-type-select')}
          value={authType}
          onChange={(value) => setAuthType(value as 'none' | 'basic' | 'token')}
          data={[
            { value: 'none', label: 'No Authentication' },
            { value: 'basic', label: 'Basic Authentication (Username/Password)' },
            { value: 'token', label: 'Token Authentication (API Key)' },
          ]}
          description="Choose authentication method for DuckDB HTTP Server"
          classNames={{
            label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
            input:
              'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
            description: 'pl-4 text-sm',
          }}
        />

        {authType === 'basic' && (
          <Group grow>
            <TextInput
              label="Username"
              data-testid={setDataTestId('http-server-username-input')}
              placeholder="Enter username"
              value={username}
              onChange={setUsername}
              description="Username for basic authentication"
              required
              classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
            />
            <PasswordInput
              label="Password"
              data-testid={setDataTestId('http-server-password-input')}
              placeholder="Enter password"
              value={password}
              onChange={setPassword}
              description="Password for basic authentication"
              required
              classNames={{
                label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
                input:
                  'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
                description: 'pl-4 text-sm',
              }}
            />
          </Group>
        )}

        {authType === 'token' && (
          <PasswordInput
            label="API Token"
            data-testid={setDataTestId('http-server-token-input')}
            placeholder="Enter API token"
            value={token}
            onChange={setToken}
            description="API token for token authentication"
            required
            classNames={{
              label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
              input:
                'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
              description: 'pl-4 text-sm',
            }}
          />
        )}

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
          disabled={
            !host.trim() ||
            !port.trim() ||
            (authType === 'basic' && (!username.trim() || !password.trim())) ||
            (authType === 'token' && !token.trim()) ||
            isConnecting
          }
          data-testid={setDataTestId('test-http-server-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isConnecting}
          disabled={
            !host.trim() ||
            !port.trim() ||
            !databaseName.trim() ||
            (authType === 'basic' && (!username.trim() || !password.trim())) ||
            (authType === 'token' && !token.trim()) ||
            isTesting
          }
          color="background-accent"
          data-testid={setDataTestId('add-http-server-button')}
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}
