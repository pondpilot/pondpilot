import { showError } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, PasswordInput, Text, Button, Group, Anchor } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { useMotherDuckConnection } from '../hooks/use-motherduck-connection';

interface MotherDuckConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function MotherDuckConfig({ onBack, onClose, pool }: MotherDuckConfigProps) {
  const [token, setToken] = useState('');

  const { isLoading, isTesting, testConnection, addConnection } = useMotherDuckConnection(pool);

  const isFormValid = token.trim().length > 0;

  const handleTest = () => {
    if (!isFormValid) {
      showError({
        title: 'Missing token',
        message: 'Please enter your MotherDuck access token',
      });
      return;
    }
    testConnection(token.trim());
  };

  const handleConnect = () => {
    if (!isFormValid) {
      showError({
        title: 'Missing token',
        message: 'Please enter your MotherDuck access token',
      });
      return;
    }
    addConnection(token.trim(), onClose);
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to your MotherDuck cloud databases
      </Text>

      <Stack gap={12}>
        <PasswordInput
          label="Access Token"
          data-testid={setDataTestId('motherduck-token-input')}
          placeholder="your-motherduck-token"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
          description={
            <>
              {'Your MotherDuck service token. '}
              <Anchor
                href="https://app.motherduck.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
              >
                Get a token
              </Anchor>
            </>
          }
          required
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
          disabled={!isFormValid || isLoading}
          data-testid={setDataTestId('test-motherduck-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleConnect}
          loading={isLoading || isTesting}
          disabled={!isFormValid || isTesting}
          data-testid={setDataTestId('connect-motherduck-button')}
        >
          Connect
        </Button>
      </Group>
    </Stack>
  );
}
