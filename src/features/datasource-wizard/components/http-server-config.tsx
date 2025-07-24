import { showError, showSuccess } from '@components/app-notifications';
import { commonTextInputClassNames } from '@components/export-options-modal/constants';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { PersistentDataSourceId } from '@models/data-source';
import { DBColumnId } from '@models/db';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { createHttpClient } from '@utils/duckdb-http-client';
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

      // Check if database name already exists in metadata
      if (databaseMetadata.has(dbName)) {
        throw new Error(
          `Database name '${dbName}' already exists. Please choose a different name.`,
        );
      }

      // Check if any existing HTTPServerDB uses the same database name
      const existingHTTPServerDB = Array.from(dataSources.values()).find(
        (dataSource) => dataSource.type === 'httpserver-db' && dataSource.dbName === dbName,
      );

      if (existingHTTPServerDB) {
        throw new Error(
          `HTTPServer database with name '${dbName}' already exists. Please choose a different name.`,
        );
      }

      // Create HTTPServerDB data source
      const httpServerDb = {
        type: 'httpserver-db' as const,
        id: `httpserver-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` as PersistentDataSourceId,
        host: host.trim(),
        port: parseInt(port.trim(), 10),
        dbName: databaseName.trim(),
        connectionState: 'connected' as const,
        attachedAt: Date.now(),
        comment: `HTTP Server at ${protocol}://${host.trim()}:${port.trim()}`,
      };

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
        const { persistPutDataSources } = await import('@controllers/data-source/persist');
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
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        Direct connection to DuckDB HTTP Server (No Authentication)
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
