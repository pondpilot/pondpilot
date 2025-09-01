import { showError } from '@components/app-notifications';
import { Select, Stack, Text, Button, Group, Alert } from '@mantine/core';
import { SecretType, SecretMetadata } from '@models/secrets';
import { IconKey, IconPlus, IconRefresh, IconDatabase } from '@tabler/icons-react';
import { useState, useEffect, useCallback } from 'react';

import { SecretsAPI } from '../../../services/secrets-api';

interface DatabaseSecretSelectorProps {
  selectedSecretId: string | null;
  onSecretSelect: (secretId: string | null, secretName?: string) => void;
  onCreateNew: () => void;
  secretType: SecretType.Postgres | SecretType.MySQL;
  label?: string;
}

export function DatabaseSecretSelector({
  selectedSecretId,
  onSecretSelect,
  onCreateNew,
  secretType,
  label,
}: DatabaseSecretSelectorProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const secretsList = await SecretsAPI.listSecrets(secretType);
      setSecrets(secretsList);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load secrets';
      showError({ title: 'Error loading secrets', message: msg });
    } finally {
      setLoading(false);
    }
  }, [secretType]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets, secretType]);

  const selectData = secrets.map((secret) => ({
    value: secret.id,
    label: secret.name,
    description: secret.description,
  }));

  const secretTypeName = secretType === SecretType.Postgres ? 'PostgreSQL' : 'MySQL';
  const defaultLabel = `Select ${secretTypeName} Credentials`;

  return (
    <Stack gap={12}>
      <Group gap={8} align="end">
        <Select
          flex={1}
          label={label || defaultLabel}
          placeholder={
            secrets.length === 0
              ? `No saved ${secretTypeName} credentials`
              : 'Choose saved credentials'
          }
          data={selectData}
          value={selectedSecretId}
          onChange={(value) => {
            const secret = secrets.find((s) => s.id === value);
            onSecretSelect(value, secret?.name);
          }}
          leftSection={<IconKey size={16} />}
          disabled={loading || secrets.length === 0}
          searchable
          clearable
        />
        <Button
          variant="light"
          color="background-accent"
          onClick={loadSecrets}
          loading={loading}
          size="sm"
        >
          <IconRefresh size={16} />
        </Button>
      </Group>

      {secrets.length === 0 && !loading && (
        <Alert color="background-accent" className="text-sm">
          <Stack gap={8}>
            <Text size="sm">No {secretTypeName} credentials saved yet.</Text>
            <Button
              variant="light"
              color="background-accent"
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={onCreateNew}
            >
              Create New Credentials
            </Button>
          </Stack>
        </Alert>
      )}

      {selectedSecretId && (
        <Group gap={8} className="text-xs text-text-secondary">
          <IconDatabase size={14} />
          <Text size="xs" c="text-secondary">
            The selected credentials will be used to authenticate with {secretTypeName}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
