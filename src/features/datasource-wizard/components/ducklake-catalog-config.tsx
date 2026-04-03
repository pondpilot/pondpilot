import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, TextInput, Text, Button, Group, Checkbox, Alert, Tooltip } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { DuckLakeCatalog } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import {
  attachAndVerifyDuckLakeCatalog,
  buildDuckLakeAttachQuery,
  deriveDuckLakeAlias,
} from '@utils/ducklake-catalog';
import { buildDetachQuery } from '@utils/sql-builder';
import { setDataTestId } from '@utils/test-id';
import { useState, useEffect } from 'react';

interface DuckLakeCatalogConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function DuckLakeCatalogConfig({ onBack, onClose, pool }: DuckLakeCatalogConfigProps) {
  const [url, setUrl] = useInputState('');
  const [catalogAlias, setCatalogAlias] = useInputState('');
  const [readOnly, setReadOnly] = useState(true);
  const [useCorsProxy, setUseCorsProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [aliasManuallyEdited, setAliasManuallyEdited] = useState(false);

  // Auto-derive alias from URL when not manually edited
  useEffect(() => {
    if (!aliasManuallyEdited && url.trim()) {
      const derived = deriveDuckLakeAlias(url.trim());
      setCatalogAlias(derived);
    }
  }, [url, aliasManuallyEdited, setCatalogAlias]);

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

    if (!url.trim()) {
      notifications.clean();
      showError({
        title: 'Missing URL',
        message: 'Please enter a DuckLake catalog URL',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    if (!catalogAlias.trim()) {
      showError({
        title: 'Missing catalog alias',
        message: 'Please enter a name for the catalog',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    try {
      const attachQuery = buildDuckLakeAttachQuery(url.trim(), catalogAlias.trim(), {
        readOnly,
        useCorsProxy,
      });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 1,
        timeout: 10000,
      });

      const detachQuery = buildDetachQuery(catalogAlias.trim(), true);
      await pool.query(detachQuery);

      showSuccess({
        title: 'Connection successful',
        message: 'DuckLake catalog connection test passed',
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

    if (!url.trim() || !catalogAlias.trim()) {
      showError({
        title: 'Missing fields',
        message: 'Please enter both a URL and a catalog alias',
      });
      return;
    }

    setIsLoading(true);
    try {
      const catalog: DuckLakeCatalog = {
        type: 'ducklake-catalog',
        id: makePersistentDataSourceId(),
        url: url.trim(),
        catalogAlias: catalogAlias.trim(),
        connectionState: 'connecting',
        attachedAt: Date.now(),
        useCorsProxy,
        readOnly,
      };

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(catalog.id, catalog);

      await attachAndVerifyDuckLakeCatalog({
        pool,
        url: catalog.url,
        catalogAlias: catalog.catalogAlias,
        readOnly,
        useCorsProxy,
        maxVerifyAttempts: 3,
      });

      catalog.connectionState = 'connected';
      newDataSources.set(catalog.id, catalog);

      try {
        const remoteMetadata = await getDatabaseModel(pool, [catalog.catalogAlias]);
        const newMetadata = new Map(databaseMetadata);
        for (const [dbName, dbModel] of remoteMetadata) {
          newMetadata.set(dbName, dbModel);
        }
        useAppStore.setState(
          { dataSources: newDataSources, databaseMetadata: newMetadata },
          false,
          'DatasourceWizard/addDuckLakeCatalog',
        );
      } catch (metadataError) {
        console.error('Failed to load metadata:', metadataError);
        useAppStore.setState(
          { dataSources: newDataSources },
          false,
          'DatasourceWizard/addDuckLakeCatalog',
        );
      }

      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        await persistPutDataSources(_iDbConn, [catalog]);
      }

      showSuccess({
        title: 'Catalog added',
        message: `Successfully connected to DuckLake catalog '${catalog.catalogAlias}'`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Failed to add catalog',
        message: `Error: ${message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to a DuckLake catalog using a URL
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        DuckLake provides a DuckDB-native data catalog format. Enter the URL to a .ducklake catalog
        file.
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="Catalog URL"
          data-testid={setDataTestId('ducklake-catalog-url-input')}
          placeholder="https://example.com/data/catalog.ducklake"
          value={url}
          onChange={setUrl}
          description="Enter the full URL to your DuckLake catalog file"
          required
        />

        <TextInput
          label="Catalog Alias"
          data-testid={setDataTestId('ducklake-catalog-alias-input')}
          placeholder="my_catalog"
          value={catalogAlias}
          onChange={(e) => {
            setCatalogAlias(e);
            setAliasManuallyEdited(true);
          }}
          description="Name used to reference this catalog in queries"
          required
        />

        <Checkbox
          label="Read-only access (Recommended for remote catalogs)"
          checked={readOnly}
          onChange={(event) => setReadOnly(event.currentTarget.checked)}
          className="pl-4"
        />

        <Tooltip
          label="Uses a CORS proxy to access the catalog without CORS headers. The proxy forwards requests transparently without logging or storing data."
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
          disabled={!url.trim() || !catalogAlias.trim() || isLoading}
          data-testid={setDataTestId('test-ducklake-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!url.trim() || !catalogAlias.trim() || isTesting}
          data-testid={setDataTestId('add-ducklake-catalog-button')}
        >
          Add Catalog
        </Button>
      </Group>
    </Stack>
  );
}
