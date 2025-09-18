import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { Stack, TextInput, Text, Button, Group, Checkbox, Alert } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { isTauriEnvironment } from '@utils/browser';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';
import {
  attachMotherDuckDatabase,
  verifyDatabaseAttached,
  MOTHERDUCK_CONSTANTS,
} from '@utils/motherduck-helper';
import { validateRemoteDatabaseUrl } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';
import { setDataTestId } from '@utils/test-id';
import { isMotherDuckUrl } from '@utils/url-helpers';
import { useState } from 'react';

interface RemoteDatabaseConfigProps {
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function RemoteDatabaseConfig({ onBack, onClose, pool }: RemoteDatabaseConfigProps) {
  const [url, setUrl] = useInputState('');
  const [dbName, setDbName] = useInputState('');
  const [readOnly, setReadOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
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

    const urlValidation = validateRemoteDatabaseUrl(url);
    if (!urlValidation.isValid) {
      notifications.clean();
      showError({
        title: 'Validation error',
        message: urlValidation.error || 'Please enter a valid URL',
        autoClose: false,
      });
      return;
    }

    if (!dbName.trim()) {
      showError({
        title: 'Missing database name',
        message: 'Please enter a name for the database',
        autoClose: false,
      });
      return;
    }

    setIsTesting(true);
    try {
      let attachQuery: string;
      let actualDbName = dbName;

      // Handle MotherDuck URLs specially
      if (isMotherDuckUrl(url)) {
        const { remoteDb } = await attachMotherDuckDatabase(pool, url);
        actualDbName = remoteDb.dbName;
        attachQuery = `ATTACH ${quote(url.trim(), { single: true })}`;
      } else {
        attachQuery = buildAttachQuery(url, dbName, { readOnly });
      }

      try {
        await executeWithRetry(pool, attachQuery, {
          maxRetries: 1,
          timeout: 10000,
        });
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isDup =
          /already in use|already attached|Unique file handle conflict|already exists/i.test(msg);
        if (!isDup) throw e;
      }

      const detachQuery = `DETACH DATABASE ${toDuckDBIdentifier(actualDbName)}`;
      await pool.query(detachQuery);

      showSuccess({
        title: 'Connection successful',
        message: 'Remote database connection test passed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
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
        title: 'Validation error',
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
      let remoteDb: RemoteDB;
      let attachQuery: string;

      // Handle MotherDuck URLs specially
      if (isMotherDuckUrl(url)) {
        const mdResult = await attachMotherDuckDatabase(pool, url);
        remoteDb = mdResult.remoteDb;
        attachQuery = `ATTACH ${quote(url.trim(), { single: true })}`;
      } else {
        const trimmedUrl = url.trim();
        const isMotherDuck = trimmedUrl.startsWith('md:');
        const connectionType = isMotherDuck ? 'motherduck' : 'url';

        remoteDb = {
          type: 'remote-db',
          id: makePersistentDataSourceId(),
          legacyUrl: trimmedUrl, // Use legacyUrl for URL-based connections
          dbName: dbName.trim(),
          connectionType, // Set proper connectionType
          queryEngineType: 'duckdb',
          supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'], // URL-based connections work on both
          requiresProxy: false,
          connectionState: 'connecting',
          attachedAt: Date.now(),
        };
        attachQuery = buildAttachQuery(trimmedUrl, remoteDb.dbName, { readOnly });
      }

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(remoteDb.id, remoteDb);

      try {
        await executeWithRetry(pool, attachQuery, {
          maxRetries: MOTHERDUCK_CONSTANTS.DEFAULT_ATTACH_MAX_RETRIES,
          timeout: MOTHERDUCK_CONSTANTS.DEFAULT_ATTACH_TIMEOUT_MS,
          retryDelay: MOTHERDUCK_CONSTANTS.DEFAULT_RETRY_DELAY_MS,
          exponentialBackoff: true,
        });
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isDup =
          /already in use|already attached|Unique file handle conflict|already exists/i.test(msg);
        if (!isDup) throw e;
      }

      // Verify the database is attached by checking the catalog
      await verifyDatabaseAttached(
        pool,
        remoteDb.dbName,
        MOTHERDUCK_CONSTANTS.MAX_VERIFICATION_ATTEMPTS,
        500, // Using slightly longer delay than default for remote DBs
      );

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

      const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
      const target = _persistenceAdapter || _iDbConn;
      if (target) {
        await persistPutDataSources(target, [remoteDb]);
      }

      showSuccess({
        title: 'Database added',
        message: `Successfully connected to remote database '${remoteDb.dbName}'`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
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
        {isTauriEnvironment() ? ', MotherDuck (md:)' : ''}
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="Database URL"
          data-testid={setDataTestId('remote-database-url-input')}
          placeholder="https://example.com/data.duckdb"
          value={url}
          onChange={setUrl}
          description="Enter the full URL to your remote database file"
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
          loading={isLoading}
          disabled={!url.trim() || !dbName.trim() || isTesting}
          data-testid={setDataTestId('add-remote-database-button')}
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}
