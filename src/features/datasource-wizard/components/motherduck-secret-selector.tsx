import { showError } from '@components/app-notifications';
import { Select, Stack, Text, Button, Group, Alert } from '@mantine/core';
import { SecretType, SecretMetadata } from '@models/secrets';
import { IconKey, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useState, useEffect } from 'react';

import { SecretsAPI } from '../../../services/secrets-api';

interface MotherDuckSecretSelectorProps {
  selectedSecretId: string | null;
  onSecretSelect: (secretId: string | null, secretName?: string) => void;
  onCreateNew: () => void;
}

export function MotherDuckSecretSelector({
  selectedSecretId,
  onSecretSelect,
  onCreateNew,
}: MotherDuckSecretSelectorProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSecrets = async () => {
    setLoading(true);
    try {
      const secretsList = await SecretsAPI.listSecrets(SecretType.MotherDuck);
      setSecrets(secretsList);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load secrets';
      showError({ title: 'Error loading secrets', message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const selectData = secrets.map((secret) => ({
    value: secret.id,
    label: secret.name,
    description: secret.description,
  }));

  return (
    <Stack gap={12}>
      <Group gap={8} align="end">
        <Select
          flex={1}
          label="Select MotherDuck Token"
          placeholder={secrets.length === 0 ? 'No saved tokens' : 'Choose a saved token'}
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
            <Text size="sm">No MotherDuck tokens saved yet.</Text>
            <Button
              variant="light"
              color="background-accent"
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={onCreateNew}
            >
              Create New Token
            </Button>
          </Stack>
        </Alert>
      )}

      {selectedSecretId && (
        <Text size="xs" c="text-secondary">
          The selected token will be used to authenticate with MotherDuck
        </Text>
      )}
    </Stack>
  );
}
