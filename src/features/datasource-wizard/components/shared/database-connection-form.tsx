import { showError } from '@components/app-notifications';
import { commonTextInputClassNames } from '@components/export-options-modal/constants';
import { ConnectionPool } from '@engines/types';
import { Stack, TextInput, Text, Button, Group, Alert, NumberInput, Select } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { SecretType } from '@models/secrets';
import { IconAlertCircle, IconDatabase, IconInfoCircle, IconX } from '@tabler/icons-react';
import { getPlatformContext, getConnectionCapability } from '@utils/platform-capabilities';
import { setDataTestId } from '@utils/test-id';
import { useState, ReactNode, useMemo } from 'react';

import { useDatabaseConnection } from '../../hooks/use-database-connection';
import { DatabaseSecretSelector } from '../database-secret-selector';

export interface DatabaseConfig {
  name: string;
  host: string;
  port: number;
  database: string;
  sslMode?: string;
}

export interface DatabaseConnectionState {
  config: DatabaseConfig;
  secretId: string | null;
  secretName?: string;
}

interface DatabaseConnectionFormProps {
  /** The database connection pool */
  pool: ConnectionPool | null;
  /** Database type ('postgres' or 'mysql') */
  databaseType: 'postgres' | 'mysql';
  /** Default port number for the database */
  defaultPort: number;
  /** Secret type for credential selection */
  secretType: SecretType.Postgres | SecretType.MySQL;
  /** Display name for the database type */
  displayName: string;
  /** Description of the database connection */
  description: string;
  /** Alert message to show users */
  alertMessage: ReactNode;
  /** SSL mode options (only for PostgreSQL) */
  sslModes?: Array<{ value: string; label: string }>;
  /** Callback when user cancels */
  onBack: () => void;
  /** Callback when connection is successfully saved */
  onClose: () => void;
  /** Optional additional form fields */
  additionalFields?: ReactNode;
}

/**
 * Shared database connection form component for PostgreSQL and MySQL
 * Extracts common form logic and reduces code duplication
 */
export function DatabaseConnectionForm({
  pool,
  databaseType,
  defaultPort,
  secretType,
  displayName,
  description,
  alertMessage,
  sslModes,
  onBack,
  onClose,
  additionalFields,
}: DatabaseConnectionFormProps) {
  const [name, setName] = useInputState('');
  const [host, setHost] = useInputState('');
  const [port, setPort] = useState<number | string>(defaultPort);
  const [database, setDatabase] = useInputState('');
  const [sslMode, setSslMode] = useState<string>(sslModes?.[0]?.value || '');
  const [selectedSecretId, setSelectedSecretId] = useState<string | null>(null);
  const [selectedSecretName, setSelectedSecretName] = useState<string | undefined>(undefined);

  // Check platform capability
  const platformCapability = useMemo(() => {
    const platformContext = getPlatformContext();
    const connectionType = databaseType === 'postgres' ? 'postgres' : 'mysql';
    return getConnectionCapability(connectionType, platformContext);
  }, [databaseType]);

  const { testConnection, saveConnection, isConnecting, isTesting } = useDatabaseConnection(
    pool,
    databaseType,
  );

  const handleSecretSelect = (secretId: string | null, secretName?: string) => {
    setSelectedSecretId(secretId);
    setSelectedSecretName(secretName);
  };

  const handleCreateNewSecret = () => {
    showError({
      title: 'Feature not implemented',
      message: `Please use the Secrets Manager to create ${displayName} credentials`,
    });
  };

  const validateForm = () => {
    if (!name.trim()) {
      showError({ title: 'Validation error', message: 'Connection name is required' });
      return false;
    }
    if (!host.trim()) {
      showError({ title: 'Validation error', message: 'Host is required' });
      return false;
    }
    if (!database.trim()) {
      showError({ title: 'Validation error', message: 'Database name is required' });
      return false;
    }
    if (!selectedSecretId) {
      showError({ title: 'Validation error', message: `${displayName} credentials are required` });
      return false;
    }
    return true;
  };

  const getConnectionState = (): DatabaseConnectionState => {
    const config: DatabaseConfig = {
      name: name.trim(),
      host: host.trim(),
      port: typeof port === 'number' ? port : parseInt(port.toString(), 10) || defaultPort,
      database: database.trim(),
    };

    // Only include SSL mode for databases that support it
    if (sslModes && sslMode) {
      config.sslMode = sslMode;
    }

    return {
      config,
      secretId: selectedSecretId,
      secretName: selectedSecretName,
    };
  };

  const handleTest = async () => {
    if (!validateForm()) return;
    await testConnection(getConnectionState());
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    const success = await saveConnection(getConnectionState());
    if (success) {
      onClose();
    }
  };

  const isFormValid = name.trim() && host.trim() && database.trim() && selectedSecretId;

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        {description}
      </Text>

      {!platformCapability.supported ? (
        <Alert
          icon={<IconX size={16} />}
          color="red"
          className="text-sm"
          title={`${displayName} Not Available`}
          classNames={{ icon: 'mr-1' }}
        >
          <Stack gap={8}>
            <Text size="sm">{platformCapability.reason}</Text>
            {platformCapability.alternatives && platformCapability.alternatives.length > 0 && (
              <Stack gap={4}>
                <Text size="sm" weight={500}>
                  Alternatives:
                </Text>
                <ul className="ml-4 space-y-1">
                  {platformCapability.alternatives.map((alt, index) => (
                    <li key={index}>
                      <Text size="sm">{alt}</Text>
                    </li>
                  ))}
                </ul>
              </Stack>
            )}
          </Stack>
        </Alert>
      ) : (
        <>
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="background-accent"
            className="text-sm"
            classNames={{ icon: 'mr-1' }}
          >
            {alertMessage}
          </Alert>

          {platformCapability.requirements && platformCapability.requirements.length > 0 && (
            <Alert
              icon={<IconInfoCircle size={16} />}
              color="blue"
              className="text-sm"
              title="Requirements"
              classNames={{ icon: 'mr-1' }}
            >
              <ul className="ml-0 space-y-1">
                {platformCapability.requirements.map((req, index) => (
                  <li key={index}>
                    <Text size="sm">{req}</Text>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </>
      )}

      <Stack gap={12}>
        <DatabaseSecretSelector
          selectedSecretId={selectedSecretId}
          onSecretSelect={handleSecretSelect}
          onCreateNew={handleCreateNewSecret}
          secretType={secretType}
          label={`${displayName} Credentials`}
        />

        <TextInput
          label="Connection Name"
          data-testid={setDataTestId(`${databaseType}-connection-name-input`)}
          placeholder={`My ${displayName} Database`}
          value={name}
          onChange={setName}
          description="A friendly name to identify this connection"
          required
          classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
        />

        <Group grow>
          <TextInput
            label="Host"
            data-testid={setDataTestId(`${databaseType}-host-input`)}
            placeholder="localhost"
            value={host}
            onChange={setHost}
            description={`${displayName} server hostname or IP address`}
            required
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
          />

          <NumberInput
            label="Port"
            data-testid={setDataTestId(`${databaseType}-port-input`)}
            placeholder={defaultPort.toString()}
            value={port}
            onChange={(value) => setPort(value ?? defaultPort)}
            description={`${displayName} server port`}
            min={1}
            max={65535}
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
          />
        </Group>

        <TextInput
          label="Database"
          data-testid={setDataTestId(`${databaseType}-database-input`)}
          placeholder={databaseType === 'postgres' ? 'postgres' : 'mydb'}
          value={database}
          onChange={setDatabase}
          description="Name of the database to connect to"
          required
          classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
        />

        {sslModes && (
          <Select
            label="SSL Mode"
            data-testid={setDataTestId(`${databaseType}-ssl-mode-select`)}
            data={sslModes}
            value={sslMode}
            onChange={(value) => setSslMode(value || sslModes[0]?.value || '')}
            description="SSL connection mode for secure connections"
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
            leftSection={<IconDatabase size={16} />}
          />
        )}

        {additionalFields}
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
          disabled={!isFormValid || isConnecting || !platformCapability.supported}
          data-testid={setDataTestId(`test-${databaseType}-connection-button`)}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleSave}
          loading={isConnecting}
          disabled={!isFormValid || isTesting || !platformCapability.supported}
          color="background-accent"
          data-testid={setDataTestId(`add-${databaseType}-database-button`)}
        >
          Add Database
        </Button>
      </Group>
    </Stack>
  );
}
