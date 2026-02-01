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
import { notifications } from '@mantine/notifications';
import { IcebergAuthType } from '@models/data-source';
import { isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
import { setDataTestId } from '@utils/test-id';
import { useState, useCallback, type ChangeEvent } from 'react';

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

interface IcebergFormState {
  catalogAlias: string;
  warehouseName: string;
  endpointType: EndpointTypeOption;
  endpoint: string;
  authType: IcebergAuthType;
  clientId: string;
  clientSecret: string;
  oauth2ServerUri: string;
  token: string;
  awsKeyId: string;
  awsSecret: string;
  defaultRegion: string;
  useCorsProxy: boolean;
}

const INITIAL_FORM_STATE: IcebergFormState = {
  catalogAlias: '',
  warehouseName: '',
  endpointType: 'generic',
  endpoint: '',
  authType: 'oauth2',
  clientId: '',
  clientSecret: '',
  oauth2ServerUri: '',
  token: '',
  awsKeyId: '',
  awsSecret: '',
  defaultRegion: '',
  useCorsProxy: false,
};

export function IcebergCatalogConfig({ onBack, onClose, pool }: IcebergCatalogConfigProps) {
  const [form, setForm] = useState<IcebergFormState>(INITIAL_FORM_STATE);

  const updateField = useCallback(
    <K extends keyof IcebergFormState>(field: K) =>
      (value: IcebergFormState[K] | ChangeEvent<HTMLInputElement>) => {
        const resolved =
          typeof value === 'object' && value !== null && 'currentTarget' in value
            ? (value.currentTarget.value as IcebergFormState[K])
            : value;
        setForm((prev) => ({ ...prev, [field]: resolved }));
      },
    [],
  );

  const { isLoading, isTesting, testConnection, addCatalog } = useIcebergConnection(pool);

  const isManagedEndpoint = isManagedIcebergEndpoint(form.endpointType);
  const effectiveAuthType = isManagedEndpoint ? 'sigv4' : form.authType;

  const isFormValid = (): boolean => {
    if (!form.catalogAlias.trim() || !form.warehouseName.trim()) return false;
    if (!isManagedEndpoint && !form.endpoint.trim()) return false;
    return true;
  };

  const connectionParams = {
    catalogAlias: form.catalogAlias,
    warehouseName: form.warehouseName,
    endpoint: form.endpoint,
    endpointType: form.endpointType,
    authType: effectiveAuthType,
    clientId: form.clientId,
    clientSecret: form.clientSecret,
    oauth2ServerUri: form.oauth2ServerUri,
    token: form.token,
    awsKeyId: form.awsKeyId,
    awsSecret: form.awsSecret,
    defaultRegion: form.defaultRegion,
    useCorsProxy: form.useCorsProxy,
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
          value={form.catalogAlias}
          onChange={updateField('catalogAlias')}
          description="Name to reference this catalog in queries (used in ATTACH ... AS)"
          required
        />

        <TextInput
          label="Warehouse Name"
          data-testid={setDataTestId('iceberg-warehouse-input')}
          placeholder="my_warehouse"
          value={form.warehouseName}
          onChange={updateField('warehouseName')}
          description="Warehouse identifier passed to the ATTACH statement"
          required
        />

        <Select
          label="Endpoint Type"
          data-testid={setDataTestId('iceberg-endpoint-type-select')}
          data={endpointTypeOptions}
          value={form.endpointType}
          onChange={(v) => {
            if (v) {
              const next: Partial<IcebergFormState> = { endpointType: v as EndpointTypeOption };
              if (v === 'GLUE' || v === 'S3_TABLES') {
                next.authType = 'sigv4';
              }
              setForm((prev) => ({ ...prev, ...next }));
            }
          }}
          description="Use Generic REST for custom endpoints, or select a managed service"
        />

        {!isManagedEndpoint && (
          <TextInput
            label="Endpoint"
            data-testid={setDataTestId('iceberg-endpoint-input')}
            placeholder="https://catalog.example.com"
            value={form.endpoint}
            onChange={updateField('endpoint')}
            description="REST catalog endpoint URL"
            required
          />
        )}

        {!isManagedEndpoint && (
          <Select
            label="Auth Type"
            data-testid={setDataTestId('iceberg-auth-type-select')}
            data={authTypeOptions}
            value={form.authType}
            onChange={(v) => {
              if (v) setForm((prev) => ({ ...prev, authType: v as IcebergAuthType }));
            }}
          />
        )}

        {effectiveAuthType === 'oauth2' && (
          <>
            <TextInput
              label="Client ID"
              data-testid={setDataTestId('iceberg-client-id-input')}
              placeholder="client_id"
              value={form.clientId}
              onChange={updateField('clientId')}
            />
            <PasswordInput
              label="Client Secret"
              data-testid={setDataTestId('iceberg-client-secret-input')}
              placeholder="client_secret"
              value={form.clientSecret}
              onChange={updateField('clientSecret')}
            />
            <TextInput
              label="OAuth2 Server URI"
              data-testid={setDataTestId('iceberg-oauth2-uri-input')}
              placeholder="https://auth.example.com/oauth/token"
              value={form.oauth2ServerUri}
              onChange={updateField('oauth2ServerUri')}
              description="Optional: token endpoint URL"
            />
          </>
        )}

        {effectiveAuthType === 'bearer' && (
          <PasswordInput
            label="Bearer Token"
            data-testid={setDataTestId('iceberg-token-input')}
            placeholder="your-token"
            value={form.token}
            onChange={updateField('token')}
          />
        )}

        {effectiveAuthType === 'sigv4' && (
          <>
            <TextInput
              label="Access Key ID"
              data-testid={setDataTestId('iceberg-aws-key-id-input')}
              placeholder="AKIA..."
              value={form.awsKeyId}
              onChange={updateField('awsKeyId')}
              description="AWS access key ID"
            />
            <PasswordInput
              label="Secret Access Key"
              data-testid={setDataTestId('iceberg-aws-secret-input')}
              placeholder="secret access key"
              value={form.awsSecret}
              onChange={updateField('awsSecret')}
              description="AWS secret access key"
            />
            <TextInput
              label="Default Region"
              data-testid={setDataTestId('iceberg-region-input')}
              placeholder="us-east-1"
              value={form.defaultRegion}
              onChange={updateField('defaultRegion')}
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
            checked={form.useCorsProxy}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, useCorsProxy: event.currentTarget.checked }))
            }
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
