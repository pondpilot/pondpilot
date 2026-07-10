import { showError, showSuccess } from '@components/app-notifications';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { deleteSecret, makeSecretId, putSecret, SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import {
  attachQuackConnection,
  getQuackDatabaseModel,
  makeQuackConnection,
  persistQuackConnection,
  validateQuackUri,
} from '@utils/quack';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface QuackConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function QuackConfig({ pool, onBack, onClose }: QuackConfigProps) {
  const [uri, setUri] = useInputState('');
  const [dbName, setDbName] = useInputState('');
  const [token, setToken] = useInputState('');
  const [disableSsl, setDisableSsl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const validateForm = (): boolean => {
    const uriValidation = validateQuackUri(uri);
    if (!uriValidation.isValid) {
      notifications.clean();
      showError({ title: 'Invalid Quack URI', message: uriValidation.error ?? 'Invalid URI' });
      return false;
    }
    if (!dbName.trim()) {
      showError({ title: 'Database name required', message: 'Please enter a database alias' });
      return false;
    }
    if (!token.trim()) {
      showError({
        title: 'Token required',
        message: 'Please enter the Quack authentication token',
      });
      return false;
    }
    return true;
  };

  const handleTest = async () => {
    if (!pool || isTesting || isLoading) return;
    if (!validateForm()) return;

    setIsTesting(true);
    const trimmedDbName = dbName.trim();
    let testAttached = false;
    try {
      await attachQuackConnection({
        pool,
        uri: uri.trim(),
        dbName: trimmedDbName,
        token,
        disableSsl,
      });
      testAttached = true;
    } catch (error) {
      showError({
        title: 'Connection failed',
        message: error instanceof Error ? error.message : String(error),
        autoClose: false,
      });
    }

    if (testAttached) {
      // Wait for the temporary DETACH before declaring success — otherwise the
      // alias stays attached and a subsequent Add with the same alias fails
      // with "database is already attached".
      try {
        await pool.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(trimmedDbName)}`);
        showSuccess({ title: 'Connection successful', message: 'Quack connection test passed' });
      } catch (detachError) {
        const message = detachError instanceof Error ? detachError.message : String(detachError);
        console.warn('Failed to detach Quack database after test:', detachError);
        showError({
          title: 'Connection test cleanup failed',
          message: `Test attach succeeded but cleanup failed: ${message}. Reload the page before retrying.`,
          autoClose: false,
        });
      }
    }
    setIsTesting(false);
  };

  const handleAdd = async () => {
    if (!pool) {
      showError({ title: 'App not ready', message: 'Please wait for the app to initialize' });
      return;
    }
    if (!validateForm()) return;

    let secretRef: SecretId | null = null;
    let secretPersisted = false;
    let quackAttached = false;
    let attachedDbName: string | null = null;
    let insertedDataSourceId: ReturnType<typeof makeQuackConnection>['id'] | null = null;
    let insertedMetadataKeys: string[] = [];

    setIsLoading(true);
    try {
      const { dataSources, databaseMetadata, _iDbConn } = useAppStore.getState();
      if (!_iDbConn) throw new Error('Encrypted secret store is not available');

      secretRef = makeSecretId();
      await putSecret(_iDbConn, secretRef, {
        label: `Quack: ${dbName.trim()}`,
        data: { token },
      });
      secretPersisted = true;

      const quack = makeQuackConnection({
        uri: uri.trim(),
        dbName: dbName.trim(),
        secretRef,
        disableSsl,
      });

      await attachQuackConnection({
        pool,
        uri: quack.uri,
        dbName: quack.dbName,
        token,
        disableSsl: quack.disableSsl,
      });
      quackAttached = true;
      attachedDbName = quack.dbName;

      const connected = { ...quack, connectionState: 'connected' as const };
      const newDataSources = new Map(dataSources);
      newDataSources.set(connected.id, connected);

      const remoteMetadata = await getQuackDatabaseModel(pool, connected.dbName);
      const newMetadata = new Map(databaseMetadata);
      for (const [remoteDbName, dbModel] of remoteMetadata) newMetadata.set(remoteDbName, dbModel);

      useAppStore.setState(
        { dataSources: newDataSources, databaseMetadata: newMetadata },
        false,
        'DatasourceWizard/addQuack',
      );
      insertedDataSourceId = connected.id;
      insertedMetadataKeys = Array.from(remoteMetadata.keys());

      await persistQuackConnection(connected);

      showSuccess({ title: 'Quack server added', message: `Connected to '${connected.dbName}'` });
      onClose();
    } catch (error) {
      const { _iDbConn } = useAppStore.getState();
      if (quackAttached && attachedDbName) {
        try {
          await pool.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(attachedDbName)}`);
        } catch (detachError) {
          console.warn('Failed to detach Quack database after add failure:', detachError);
        }
      }
      // Surgical rollback: remove only the entries this handler inserted, so a
      // concurrent store mutation between setState and the catch isn't reverted.
      if (insertedDataSourceId || insertedMetadataKeys.length > 0) {
        const { dataSources: currentDataSources, databaseMetadata: currentMetadata } =
          useAppStore.getState();
        const nextDataSources = new Map(currentDataSources);
        if (insertedDataSourceId) nextDataSources.delete(insertedDataSourceId);
        const nextMetadata = new Map(currentMetadata);
        for (const key of insertedMetadataKeys) nextMetadata.delete(key);
        useAppStore.setState(
          { dataSources: nextDataSources, databaseMetadata: nextMetadata },
          false,
          'DatasourceWizard/rollbackQuackAdd',
        );
      }
      if (secretPersisted && secretRef && _iDbConn) {
        try {
          await deleteSecret(_iDbConn, secretRef);
        } catch (cleanupError) {
          console.warn('Failed to clean up Quack secret after connection failure:', cleanupError);
        }
      }
      showError({
        title: 'Failed to add Quack server',
        message: error instanceof Error ? error.message : String(error),
        autoClose: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to a live DuckDB server using the Quack protocol
      </Text>

      <Alert icon={<IconAlertCircle size={16} />} color="background-accent" className="text-sm">
        Browser clients require HTTPS and CORS for remote hosts. Use Disable SSL only for local or
        trusted development servers.
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="Quack URI"
          data-testid={setDataTestId('quack-uri-input')}
          placeholder="quack:localhost:9494"
          value={uri}
          onChange={setUri}
          required
        />
        <TextInput
          label="Database Name"
          data-testid={setDataTestId('quack-database-name-input')}
          placeholder="remote_duckdb"
          value={dbName}
          onChange={setDbName}
          required
        />
        <PasswordInput
          label="Token"
          data-testid={setDataTestId('quack-token-input')}
          placeholder="Quack authentication token"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
          required
        />
        <Checkbox
          label="Disable SSL (local/dev only)"
          checked={disableSsl}
          onChange={(event) => setDisableSsl(event.currentTarget.checked)}
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
          disabled={!uri.trim() || !dbName.trim() || !token.trim() || isLoading}
          data-testid={setDataTestId('test-quack-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!uri.trim() || !dbName.trim() || !token.trim() || isTesting}
          data-testid={setDataTestId('add-quack-button')}
        >
          Add Quack Server
        </Button>
      </Group>
    </Stack>
  );
}
