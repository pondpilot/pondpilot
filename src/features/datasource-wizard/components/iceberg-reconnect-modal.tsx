import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Modal, Stack, TextInput, PasswordInput, Text, Button, Group, Select } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { IcebergAuthType, IcebergCatalog } from '@models/data-source';
import { reconnectIcebergCatalog, IcebergCredentials } from '@utils/iceberg-catalog';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface IcebergReconnectModalProps {
  catalog: IcebergCatalog;
  pool: AsyncDuckDBConnectionPool;
  opened: boolean;
  onClose: () => void;
}

const authTypeOptions: { value: IcebergAuthType; label: string }[] = [
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'sigv4', label: 'SigV4 (AWS)' },
  { value: 'none', label: 'None' },
];

export function IcebergReconnectModal({
  catalog,
  pool,
  opened,
  onClose,
}: IcebergReconnectModalProps) {
  const [authType, setAuthType] = useState<IcebergAuthType>(catalog.authType);
  const [clientId, setClientId] = useInputState('');
  const [clientSecret, setClientSecret] = useInputState('');
  const [oauth2ServerUri, setOauth2ServerUri] = useInputState(catalog.oauth2ServerUri ?? '');
  const [token, setToken] = useInputState('');
  const [awsKeyId, setAwsKeyId] = useInputState('');
  const [awsSecret, setAwsSecret] = useInputState('');
  const [defaultRegion, setDefaultRegion] = useInputState(catalog.defaultRegion ?? '');
  const [isLoading, setIsLoading] = useState(false);

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      const credentials: IcebergCredentials = {
        authType,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        oauth2ServerUri: oauth2ServerUri.trim() || undefined,
        token: token.trim(),
        awsKeyId: awsKeyId.trim() || undefined,
        awsSecret: awsSecret.trim() || undefined,
        defaultRegion: defaultRegion.trim() || undefined,
      };

      const success = await reconnectIcebergCatalog(pool, catalog, credentials);
      if (success) {
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Reconnect Iceberg Catalog" size="md">
      <Stack gap={16}>
        <Stack gap={4}>
          <Text size="sm" c="text-secondary">
            Catalog: <strong>{catalog.catalogAlias}</strong>
          </Text>
          <Text size="sm" c="text-secondary">
            Warehouse: <strong>{catalog.warehouseName}</strong>
          </Text>
          {catalog.endpoint && (
            <Text size="sm" c="text-secondary">
              Endpoint: <strong>{catalog.endpoint}</strong>
            </Text>
          )}
          {catalog.endpointType && (
            <Text size="sm" c="text-secondary">
              Endpoint Type: <strong>{catalog.endpointType}</strong>
            </Text>
          )}
        </Stack>

        <Stack gap={12}>
          <Select
            label="Auth Type"
            data-testid={setDataTestId('iceberg-reconnect-auth-type-select')}
            data={authTypeOptions}
            value={authType}
            onChange={(v) => {
              if (v) setAuthType(v as IcebergAuthType);
            }}
          />

          {authType === 'oauth2' && (
            <>
              <TextInput
                label="Client ID"
                data-testid={setDataTestId('iceberg-reconnect-client-id-input')}
                placeholder="client_id"
                value={clientId}
                onChange={setClientId}
              />
              <PasswordInput
                label="Client Secret"
                data-testid={setDataTestId('iceberg-reconnect-client-secret-input')}
                placeholder="client_secret"
                value={clientSecret}
                onChange={setClientSecret}
              />
              <TextInput
                label="OAuth2 Server URI"
                data-testid={setDataTestId('iceberg-reconnect-oauth2-uri-input')}
                placeholder="https://auth.example.com/oauth/token"
                value={oauth2ServerUri}
                onChange={setOauth2ServerUri}
                description="Optional: token endpoint URL"
              />
            </>
          )}

          {authType === 'bearer' && (
            <PasswordInput
              label="Bearer Token"
              data-testid={setDataTestId('iceberg-reconnect-token-input')}
              placeholder="your-token"
              value={token}
              onChange={setToken}
            />
          )}

          {authType === 'sigv4' && (
            <>
              <TextInput
                label="Access Key ID"
                data-testid={setDataTestId('iceberg-reconnect-aws-key-id-input')}
                placeholder="AKIA..."
                value={awsKeyId}
                onChange={setAwsKeyId}
                description="AWS access key ID"
              />
              <PasswordInput
                label="Secret Access Key"
                data-testid={setDataTestId('iceberg-reconnect-aws-secret-input')}
                placeholder="secret access key"
                value={awsSecret}
                onChange={setAwsSecret}
                description="AWS secret access key"
              />
              <TextInput
                label="Default Region"
                data-testid={setDataTestId('iceberg-reconnect-region-input')}
                placeholder="us-east-1"
                value={defaultRegion}
                onChange={setDefaultRegion}
                description="Optional: AWS region"
              />
            </>
          )}
        </Stack>

        <Group justify="end" className="mt-4">
          <Button variant="transparent" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleReconnect}
            loading={isLoading}
            data-testid={setDataTestId('iceberg-reconnect-button')}
          >
            Reconnect
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
