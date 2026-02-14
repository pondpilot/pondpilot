import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  Modal,
  Stack,
  PasswordInput,
  Text,
  Button,
  Group,
  Anchor,
  Loader,
  Center,
} from '@mantine/core';
import { MotherDuckConnection } from '@models/data-source';
import { putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { reconnectMotherDuck, resolveMotherDuckToken } from '@utils/motherduck';
import { setDataTestId } from '@utils/test-id';
import { useState, useEffect, useRef } from 'react';

interface MotherDuckReconnectModalProps {
  connection: MotherDuckConnection;
  pool: AsyncDuckDBConnectionPool;
  opened: boolean;
  onClose: () => void;
}

export function MotherDuckReconnectModal({
  connection,
  pool,
  opened,
  onClose,
}: MotherDuckReconnectModalProps) {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const attemptedAutoRef = useRef(false);

  // On open, attempt auto-reconnect with stored token
  useEffect(() => {
    if (!opened || attemptedAutoRef.current) return;
    attemptedAutoRef.current = true;

    const tryAutoReconnect = async () => {
      const { _iDbConn } = useAppStore.getState();
      if (!_iDbConn) return;

      const storedToken = await resolveMotherDuckToken(_iDbConn, connection);
      if (!storedToken) return;

      setAutoReconnecting(true);
      try {
        const success = await reconnectMotherDuck(pool, connection, storedToken);
        if (success) {
          onClose();
          return;
        }
      } catch {
        // Stored token failed — fall through to manual entry
      }
      setAutoReconnecting(false);
    };

    tryAutoReconnect();
  }, [opened]);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      attemptedAutoRef.current = false;
      setAutoReconnecting(false);
      setToken('');
    }
  }, [opened]);

  const handleReconnect = async () => {
    const trimmedToken = token.trim();
    if (!trimmedToken) return;

    setIsLoading(true);
    try {
      const success = await reconnectMotherDuck(pool, connection, trimmedToken);
      if (success) {
        // Persist updated token to secret store
        const { _iDbConn } = useAppStore.getState();
        if (_iDbConn && connection.secretRef) {
          await putSecret(_iDbConn, connection.secretRef, {
            label: 'MotherDuck',
            data: { token: trimmedToken },
          });
        }
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (autoReconnecting) {
    return (
      <Modal opened={opened} onClose={onClose} title="Reconnecting to MotherDuck" size="md">
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="text-secondary">
              Reconnecting with saved credentials...
            </Text>
          </Stack>
        </Center>
      </Modal>
    );
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Reconnect to MotherDuck" size="md">
      <Stack gap={16}>
        <Text size="sm" c="text-secondary">
          Enter your MotherDuck access token to reconnect.
        </Text>

        <PasswordInput
          label="Access Token"
          data-testid={setDataTestId('motherduck-reconnect-token-input')}
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
        />

        <Group justify="end" className="mt-4">
          <Button variant="transparent" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleReconnect}
            loading={isLoading}
            disabled={!token.trim()}
            data-testid={setDataTestId('motherduck-reconnect-button')}
          >
            Reconnect
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
