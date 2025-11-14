import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, TextInput, Text, Button, Group, Checkbox, Alert, Tooltip } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { validateRemoteDatabaseUrl } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface RemoteDatabaseConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function RemoteDatabaseConfig({ onBack, onClose, pool }: RemoteDatabaseConfigProps) {
  const [url, setUrl] = useInputState('');
  const [dbName, setDbName] = useInputState('');
  const [readOnly, setReadOnly] = useState(true);
  const [useCorsProxy, setUseCorsProxy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    if (isTesting || isLoading) {
      return;
    }

    setIsTesting(true);

    const finishTesting = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      setIsTesting(false);
    };

    if (!pool) {
      showError({
        title: 'App not ready',
        message: 'Please wait for the app to initialize',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    const urlValidation = validateRemoteDatabaseUrl(url);
    if (!urlValidation.isValid) {
      notifications.clean();
      showError({
        title: 'Invalid URL',
        message: urlValidation.error || 'Please enter a valid URL',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    if (!dbName.trim()) {
      showError({
        title: 'Missing database name',
        message: 'Please enter a name for the database',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    try {
      const attachQuery = buildAttachQuery(url, dbName, { readOnly, useCorsProxy });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 1,
        timeout: 10000,
      });

      const detachQuery = `DETACH DATABASE ${toDuckDBIdentifier(dbName)}`;
      await pool.query(detachQuery);

      showSuccess({
        title: 'Connection successful',
        message: 'Remote database connection test passed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Connection failed',
        message: `Failed to connect: ${message}`,
      });
    } finally {
      await finishTesting();
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

    const urlValidation = validateRemoteDatabaseUrl(url);
    if (!urlValidation.isValid) {
      showError({
        title: 'Invalid URL',
        message: urlValidation.error || 'Please enter a valid URL',
      });
      return;
    }

    if (!dbName.trim()) {
      showError({
        title: 'Database name required',
        message: 'Please enter a name for the database',
      });
      return;
    }

    setIsLoading(true);
    try {
      const remoteDb: RemoteDB = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        url: url.trim(),
        dbName: dbName.trim(),
        dbType: 'duckdb',
        connectionState: 'connecting',
        attachedAt: Date.now(),
        useCorsProxy,
      };

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(remoteDb.id, remoteDb);

      const attachQuery = buildAttachQuery(remoteDb.url, remoteDb.dbName, {
        readOnly,
        useCorsProxy,
      });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 3,
        timeout: 30000,
        retryDelay: 2000,
        exponentialBackoff: true,
      });

      // Verify the database is attached by checking the catalog
      // This replaces the arbitrary 1-second delay with a proper readiness check
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${remoteDb.dbName}'`;

      let dbFound = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!dbFound && attempts < maxAttempts) {
        try {
          const result = await pool.query(checkQuery);
          if (result && result.numRows > 0) {
            dbFound = true;
          } else {
            throw new Error('Database not found in catalog');
          }
        } catch (error) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            throw new Error(
              `Database ${remoteDb.dbName} could not be verified after ${maxAttempts} attempts`,
            );
          }
          console.warn(`Attempt ${attempts}: Database not ready yet, waiting...`);
          await new Promise((resolve) => setTimeout(resolve, 500)); // Shorter delay between attempts
        }
      }

      remoteDb.connectionState = 'connected';
      newDataSources.set(remoteDb.id, remoteDb);

      try {
        const remoteMetadata = await getDatabaseModel(pool, [remoteDb.dbName]);
        const newMetadata = new Map(databaseMetadata);
        for (const [remoteDbName, dbModel] of remoteMetadata) {
          newMetadata.set(remoteDbName, dbModel);
        }
        useAppStore.setState(
          { dataSources: newDataSources, databaseMetadata: newMetadata },
          false,
          'DatasourceWizard/addRemoteDatabase',
        );
      } catch (metadataError) {
        console.error('Failed to load metadata:', metadataError);
        useAppStore.setState(
          { dataSources: newDataSources },
          false,
          'DatasourceWizard/addRemoteDatabase',
        );
      }

      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        await persistPutDataSources(_iDbConn, [remoteDb]);
      }

      showSuccess({
        title: 'Database added',
        message: `Successfully connected to remote database '${remoteDb.dbName}'`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Failed to add database',
        message: `Error: ${message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to a remote database using a URL
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        Supported protocols: HTTPS, S3, GCS (Google Cloud Storage), Azure Blob Storage
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="Database URL"
          data-testid={setDataTestId('remote-database-url-input')}
          placeholder="https://example.com/data.parquet"
          value={url}
          onChange={setUrl}
          description="Enter the full URL to your remote database or file"
          required
        />

        <TextInput
          label="Database Name"
          data-testid={setDataTestId('remote-database-name-input')}
          placeholder="my_remote_db"
          value={dbName}
          onChange={setDbName}
          description="Choose a name to reference this database in queries"
          required
        />

        <Checkbox
          label="Read-only access (Recommended for remote databases)"
          checked={readOnly}
          onChange={(event) => setReadOnly(event.currentTarget.checked)}
          className="pl-4"
        />

        <Tooltip
          label="Uses a CORS proxy to access databases without CORS headers. The proxy forwards requests transparently without logging or storing data."
          multiline
          w={300}
          withArrow
          position="right"
        >
          <Checkbox
            label="Use CORS proxy"
            checked={useCorsProxy}
            onChange={(event) => setUseCorsProxy(event.currentTarget.checked)}
            className="pl-4"
          />
        </Tooltip>
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" onClick={onBack}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          loading={isTesting}
          disabled={!url.trim() || !dbName.trim() || isLoading}
          data-testid={setDataTestId('test-remote-database-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!url.trim() || !dbName.trim() || isTesting}
          data-testid={setDataTestId('add-remote-database-button')}
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}
