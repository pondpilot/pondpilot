import { showError } from '@components/app-notifications';
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
import { IcebergAuthType } from '@models/data-source';
import { isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { useIcebergConnection } from '../hooks/use-iceberg-connection';

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

  const { isLoading, isTesting, testConnection, addCatalog } = useIcebergConnection(pool);

  const isManagedEndpoint = isManagedIcebergEndpoint(endpointType);
  const effectiveAuthType = isManagedEndpoint ? 'sigv4' : authType;

  const isFormValid = (): boolean => {
    if (!catalogAlias.trim() || !warehouseName.trim()) return false;
    if (!isManagedEndpoint && !endpoint.trim()) return false;
    return true;
  };

  const connectionParams = {
    catalogAlias,
    warehouseName,
    endpoint,
    endpointType,
    authType: effectiveAuthType,
    clientId,
    clientSecret,
    oauth2ServerUri,
    token,
    awsKeyId,
    awsSecret,
    defaultRegion,
    useCorsProxy,
  };

  const handleTest = () => {
    if (!isFormValid()) {
      notifications.clean();
      showError({
        title: 'Missing fields',
        message: 'Please fill in all required fields',
        autoClose: false,
      });
      return;
    }
    testConnection(connectionParams);
  };

  const handleAdd = () => {
    if (!isFormValid()) {
      showError({
        title: 'Missing fields',
        message: 'Please fill in all required fields',
      });
      return;
    }
    addCatalog(connectionParams, onClose);
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
