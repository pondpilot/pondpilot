import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Stack, TextInput, Text, Button, Group, Checkbox, Alert } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { validateRemoteDatabaseUrl } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';
import { useState } from 'react';

interface RemoteDatabaseConfigProps {
  onBack: () => void;
  onClose: () => void;
}

export function RemoteDatabaseConfig({ onBack, onClose }: RemoteDatabaseConfigProps) {
  const [url, setUrl] = useInputState('');
  const [dbName, setDbName] = useInputState('');
  const [readOnly, setReadOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const pool = useDuckDBConnectionPool();

  const handleTest = async () => {
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

    setIsTesting(true);
    try {
      const attachQuery = buildAttachQuery(url, dbName, { readOnly });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 1,
        timeout: 10000,
      });

      const detachQuery = `DETACH DATABASE ${dbName}`;
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
      };

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(remoteDb.id, remoteDb);

      const attachQuery = buildAttachQuery(remoteDb.url, remoteDb.dbName, { readOnly });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 3,
        timeout: 30000,
        retryDelay: 2000,
        exponentialBackoff: true,
      });

      // Verify the database is attached by checking the catalog
      // This replaces the arbitrary 1-second delay with a proper readiness check
      const escapedDbName = toDuckDBIdentifier(remoteDb.dbName);
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${escapedDbName}`;

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
      <Button
        variant="subtle"
        onClick={onBack}
        leftSection={<IconArrowLeft size={16} />}
        className="w-fit -ml-2"
        size="compact-sm"
      >
        Back
      </Button>

      <Stack gap={12}>
        <Text fw={500}>Configure Remote Database</Text>
        <Text size="sm" c="text-secondary">
          Connect to a remote database using a URL
        </Text>
      </Stack>

      <Alert icon={<IconAlertCircle size={16} />} color="blue" className="text-sm">
        Supported protocols: HTTPS, S3, GCS (Google Cloud Storage), Azure Blob Storage
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="Database URL"
          placeholder="https://example.com/data.parquet"
          value={url}
          onChange={setUrl}
          description="Enter the full URL to your remote database or file"
          required
        />

        <TextInput
          label="Database Name"
          placeholder="my_remote_db"
          value={dbName}
          onChange={setDbName}
          description="Choose a name to reference this database in queries"
          required
        />

        <Checkbox
          label="Read-only access"
          checked={readOnly}
          onChange={(event) => setReadOnly(event.currentTarget.checked)}
          description="Recommended for remote databases"
        />
      </Stack>

      <Group justify="flex-end" gap={8} className="mt-4">
        <Button variant="subtle" onClick={onBack}>
          Cancel
        </Button>
        <Button
          variant="light"
          onClick={handleTest}
          loading={isTesting}
          disabled={!url.trim() || !dbName.trim()}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading}
          disabled={!url.trim() || !dbName.trim()}
          color="background-accent"
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}
