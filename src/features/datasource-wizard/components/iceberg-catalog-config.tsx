import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  Stack,
  TextInput,
  PasswordInput,
  Text,
  Button,
  Group,
  Checkbox,
  Select,
  Tooltip,
} from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IcebergAuthType, IcebergCatalog } from '@models/data-source';
import { makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { buildIcebergSecretPayload, isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import {
  buildIcebergSecretQuery,
  buildDropSecretQuery,
  buildIcebergAttachQuery,
} from '@utils/iceberg-sql-builder';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface IcebergCatalogConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

type EndpointTypeOption = 'generic' | 'GLUE' | 'S3_TABLES';

const endpointTypeOptions = [
  { value: 'generic', label: 'Generic REST' },
  { value: 'GLUE', label: 'AWS Glue' },
  { value: 'S3_TABLES', label: 'S3 Tables' },
];

const authTypeOptions: { value: IcebergAuthType; label: string }[] = [
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'sigv4', label: 'SigV4 (AWS)' },
  { value: 'none', label: 'None' },
];

/**
 * Generate a unique secret name for DuckDB, based on the catalog alias.
 */
function generateSecretName(alias: string): string {
  const suffix = Date.now().toString(36);
  return `iceberg_secret_${alias}_${suffix}`;
}

export function IcebergCatalogConfig({ onBack, onClose, pool }: IcebergCatalogConfigProps) {
  const [catalogAlias, setCatalogAlias] = useInputState('');
  const [warehouseName, setWarehouseName] = useInputState('');
  const [endpointType, setEndpointType] = useState<EndpointTypeOption>('generic');
  const [endpoint, setEndpoint] = useInputState('');
  const [authType, setAuthType] = useState<IcebergAuthType>('oauth2');
  const [clientId, setClientId] = useInputState('');
  const [clientSecret, setClientSecret] = useInputState('');
  const [oauth2ServerUri, setOauth2ServerUri] = useInputState('');
  const [token, setToken] = useInputState('');
  const [awsKeyId, setAwsKeyId] = useInputState('');
  const [awsSecret, setAwsSecret] = useInputState('');
  const [defaultRegion, setDefaultRegion] = useInputState('');
  const [useCorsProxy, setUseCorsProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const isManagedEndpoint = isManagedIcebergEndpoint(endpointType);
  const effectiveAuthType = isManagedEndpoint ? 'sigv4' : authType;

  const isFormValid = (): boolean => {
    if (!catalogAlias.trim() || !warehouseName.trim()) return false;
    if (!isManagedEndpoint && !endpoint.trim()) return false;
    return true;
  };

  const handleTest = async () => {
    if (isTesting || isLoading) return;

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

    if (!isFormValid()) {
      notifications.clean();
      showError({
        title: 'Missing fields',
        message: 'Please fill in all required fields',
        autoClose: false,
      });
      await finishTesting();
      return;
    }

    const secretName = generateSecretName(catalogAlias.trim());

    try {
      // Create secret
      const secretQuery = buildIcebergSecretQuery({
        secretName,
        authType: effectiveAuthType,
        useS3SecretType: isManagedEndpoint,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        oauth2ServerUri: oauth2ServerUri.trim() || undefined,
        token: token.trim(),
        awsKeyId: awsKeyId.trim() || undefined,
        awsSecret: awsSecret.trim() || undefined,
        defaultRegion: defaultRegion.trim() || undefined,
      });
      await pool.query(secretQuery);

      // Attach
      const alias = catalogAlias.trim();
      const attachQuery = buildIcebergAttachQuery({
        warehouseName: warehouseName.trim(),
        catalogAlias: alias,
        endpoint: isManagedEndpoint ? undefined : endpoint.trim(),
        endpointType: isManagedEndpoint ? (endpointType as 'GLUE' | 'S3_TABLES') : undefined,
        secretName,
        useCorsProxy,
      });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 1,
        timeout: 15000,
      });

      // Verify
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
      await pool.query(checkQuery);

      // Clean up test resources
      const detachQuery = `DETACH DATABASE ${toDuckDBIdentifier(alias)}`;
      await pool.query(detachQuery);
      await pool.query(buildDropSecretQuery(secretName));

      showSuccess({
        title: 'Connection successful',
        message: 'Iceberg catalog connection test passed',
      });
    } catch (error) {
      const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      showError({
        title: 'Connection failed',
        message: `Failed to connect: ${message}`,
      });

      // Best-effort cleanup
      try {
        await pool.query(buildDropSecretQuery(secretName));
      } catch {
        // Ignore cleanup errors
      }
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

    if (!isFormValid()) {
      showError({
        title: 'Missing fields',
        message: 'Please fill in all required fields',
      });
      return;
    }

    setIsLoading(true);
    const alias = catalogAlias.trim();
    const secretName = generateSecretName(alias);

    try {
      // Store credentials in the encrypted secret store
      const secretRefId = makeSecretId();
      const credentials = {
        authType: effectiveAuthType,
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        oauth2ServerUri: oauth2ServerUri.trim() || undefined,
        token: token.trim() || undefined,
        awsKeyId: awsKeyId.trim() || undefined,
        awsSecret: awsSecret.trim() || undefined,
        defaultRegion: defaultRegion.trim() || undefined,
      };

      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        const payload = buildIcebergSecretPayload(`Iceberg: ${alias}`, credentials);
        await putSecret(_iDbConn, secretRefId, payload);
      }

      const catalog: IcebergCatalog = {
        type: 'iceberg-catalog',
        id: makePersistentDataSourceId(),
        catalogAlias: alias,
        warehouseName: warehouseName.trim(),
        endpoint: endpoint.trim(),
        authType: effectiveAuthType,
        connectionState: 'connecting',
        attachedAt: Date.now(),
        useCorsProxy,
        secretName,
        endpointType: isManagedEndpoint ? (endpointType as 'GLUE' | 'S3_TABLES') : undefined,
        defaultRegion: defaultRegion.trim() || undefined,
        oauth2ServerUri: oauth2ServerUri.trim() || undefined,
        secretRef: secretRefId,
      };

      const { dataSources, databaseMetadata } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(catalog.id, catalog);

      // Create secret
      const secretQuery = buildIcebergSecretQuery({
        secretName,
        authType: effectiveAuthType,
        useS3SecretType: isManagedEndpoint,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        oauth2ServerUri: oauth2ServerUri.trim() || undefined,
        token: token.trim(),
        awsKeyId: awsKeyId.trim() || undefined,
        awsSecret: awsSecret.trim() || undefined,
        defaultRegion: defaultRegion.trim() || undefined,
      });
      await pool.query(secretQuery);

      // Attach
      const attachQuery = buildIcebergAttachQuery({
        warehouseName: catalog.warehouseName,
        catalogAlias: alias,
        endpoint: isManagedEndpoint ? undefined : catalog.endpoint,
        endpointType: catalog.endpointType,
        secretName,
        useCorsProxy,
      });
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 3,
        timeout: 30000,
        retryDelay: 2000,
        exponentialBackoff: true,
      });

      // Verify
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
      let dbFound = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!dbFound && attempts < maxAttempts) {
        try {
          const result = await pool.query(checkQuery);
          if (result && result.numRows > 0) {
            dbFound = true;
          } else {
            throw new Error('Catalog not found in duckdb_databases');
          }
        } catch (error) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            throw new Error(
              `Catalog ${alias} could not be verified after ${maxAttempts} attempts`,
            );
          }
          console.warn(`Attempt ${attempts}: Catalog not ready yet, waiting...`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      catalog.connectionState = 'connected';
      newDataSources.set(catalog.id, catalog);

      try {
        const remoteMetadata = await getDatabaseModel(pool, [alias]);
        const newMetadata = new Map(databaseMetadata);
        for (const [dbName, dbModel] of remoteMetadata) {
          newMetadata.set(dbName, dbModel);
        }
        useAppStore.setState(
          { dataSources: newDataSources, databaseMetadata: newMetadata },
          false,
          'DatasourceWizard/addIcebergCatalog',
        );
      } catch (metadataError) {
        console.error('Failed to load metadata:', metadataError);
        useAppStore.setState(
          { dataSources: newDataSources },
          false,
          'DatasourceWizard/addIcebergCatalog',
        );
      }

      const { _iDbConn: iDbConn } = useAppStore.getState();
      if (iDbConn) {
        await persistPutDataSources(iDbConn, [catalog]);
      }

      showSuccess({
        title: 'Catalog added',
        message: `Successfully connected to Iceberg catalog '${alias}'`,
      });
      onClose();
    } catch (error) {
      const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      showError({
        title: 'Failed to add catalog',
        message: `Error: ${message}`,
      });

      // Best-effort cleanup
      try {
        await pool.query(buildDropSecretQuery(secretName));
      } catch {
        // Ignore cleanup errors
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to an Iceberg REST catalog
      </Text>

      <Stack gap={12}>
        <TextInput
          label="Catalog Alias"
          data-testid={setDataTestId('iceberg-catalog-alias-input')}
          placeholder="my_iceberg"
          value={catalogAlias}
          onChange={setCatalogAlias}
          description="Name to reference this catalog in queries (used in ATTACH ... AS)"
          required
        />

        <TextInput
          label="Warehouse Name"
          data-testid={setDataTestId('iceberg-warehouse-input')}
          placeholder="my_warehouse"
          value={warehouseName}
          onChange={setWarehouseName}
          description="Warehouse identifier passed to the ATTACH statement"
          required
        />

        <Select
          label="Endpoint Type"
          data-testid={setDataTestId('iceberg-endpoint-type-select')}
          data={endpointTypeOptions}
          value={endpointType}
          onChange={(v) => {
            if (v) {
              setEndpointType(v as EndpointTypeOption);
              if (v === 'GLUE' || v === 'S3_TABLES') {
                setAuthType('sigv4');
              }
            }
          }}
          description="Use Generic REST for custom endpoints, or select a managed service"
        />

        {!isManagedEndpoint && (
          <TextInput
            label="Endpoint"
            data-testid={setDataTestId('iceberg-endpoint-input')}
            placeholder="https://catalog.example.com"
            value={endpoint}
            onChange={setEndpoint}
            description="REST catalog endpoint URL"
            required
          />
        )}

        {!isManagedEndpoint && (
          <Select
            label="Auth Type"
            data-testid={setDataTestId('iceberg-auth-type-select')}
            data={authTypeOptions}
            value={authType}
            onChange={(v) => {
              if (v) setAuthType(v as IcebergAuthType);
            }}
          />
        )}

        {effectiveAuthType === 'oauth2' && (
          <>
            <TextInput
              label="Client ID"
              data-testid={setDataTestId('iceberg-client-id-input')}
              placeholder="client_id"
              value={clientId}
              onChange={setClientId}
            />
            <PasswordInput
              label="Client Secret"
              data-testid={setDataTestId('iceberg-client-secret-input')}
              placeholder="client_secret"
              value={clientSecret}
              onChange={setClientSecret}
            />
            <TextInput
              label="OAuth2 Server URI"
              data-testid={setDataTestId('iceberg-oauth2-uri-input')}
              placeholder="https://auth.example.com/oauth/token"
              value={oauth2ServerUri}
              onChange={setOauth2ServerUri}
              description="Optional: token endpoint URL"
            />
          </>
        )}

        {effectiveAuthType === 'bearer' && (
          <PasswordInput
            label="Bearer Token"
            data-testid={setDataTestId('iceberg-token-input')}
            placeholder="your-token"
            value={token}
            onChange={setToken}
          />
        )}

        {effectiveAuthType === 'sigv4' && (
          <>
            <TextInput
              label="Access Key ID"
              data-testid={setDataTestId('iceberg-aws-key-id-input')}
              placeholder="AKIA..."
              value={awsKeyId}
              onChange={setAwsKeyId}
              description="AWS access key ID"
            />
            <PasswordInput
              label="Secret Access Key"
              data-testid={setDataTestId('iceberg-aws-secret-input')}
              placeholder="secret access key"
              value={awsSecret}
              onChange={setAwsSecret}
              description="AWS secret access key"
            />
            <TextInput
              label="Default Region"
              data-testid={setDataTestId('iceberg-region-input')}
              placeholder="us-east-1"
              value={defaultRegion}
              onChange={setDefaultRegion}
              description="Optional: AWS region"
            />
          </>
        )}

        <Tooltip
          label="Uses a CORS proxy to access the catalog endpoint. Enable if you get CORS errors in the browser."
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
          disabled={!isFormValid() || isLoading}
          data-testid={setDataTestId('test-iceberg-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!isFormValid() || isTesting}
          data-testid={setDataTestId('add-iceberg-catalog-button')}
        >
          Add Catalog
        </Button>
      </Group>
    </Stack>
  );
}
