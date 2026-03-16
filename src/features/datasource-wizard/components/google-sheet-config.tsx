import { showError } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, TextInput, Text, Button, Group, Radio, Loader, Alert, Anchor } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import type { GSheetAccessMode } from '@models/data-source';
import { requestGoogleAccessToken } from '@services/google-identity-services';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { getGoogleOAuthClientId } from '@utils/google-oauth-config';
import { useState, useCallback } from 'react';

import { useGSheetConnection } from '../hooks/use-gsheet-connection';

interface GoogleSheetConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function GoogleSheetConfig({ pool, onBack, onClose }: GoogleSheetConfigProps) {
  const [sheetRef, setSheetRef] = useInputState('');
  const [connectionName, setConnectionName] = useInputState('');
  const [accessToken, setAccessToken] = useInputState('');
  const [accessMode, setAccessMode] = useState<GSheetAccessMode>('public');
  const [oauthAuthenticated, setOauthAuthenticated] = useState(false);
  const [oauthExpiresIn, setOauthExpiresIn] = useState<number | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { isLoading, isTesting, discoveredSheets, testConnection, addGoogleSheet } =
    useGSheetConnection(pool);

  const resolvedAccessToken = accessToken.trim();
  const hasAccessToken = resolvedAccessToken.length > 0;
  const clientId = getGoogleOAuthClientId();
  const hasClientId = clientId.length > 0;

  const needsToken =
    (accessMode === 'authorized' && !hasAccessToken) ||
    (accessMode === 'oauth' && !oauthAuthenticated);

  const params = {
    sheetRef,
    connectionName,
    accessMode,
    accessToken,
    tokenExpiresIn: oauthExpiresIn ?? undefined,
  };

  const handleTest = () => testConnection(params);
  const handleAdd = () => addGoogleSheet(params, onClose);

  const handleOAuthSignIn = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const result = await requestGoogleAccessToken(clientId);
      setAccessToken(result.accessToken);
      setOauthAuthenticated(true);
      setOauthExpiresIn(result.expiresIn);
    } catch (error) {
      setOauthAuthenticated(false);
      setOauthExpiresIn(null);
      showError({
        title: 'Google Sign-In failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, [clientId, setAccessToken]);

  const handleOpenSettings = useCallback(() => {
    onClose();
    // Navigate via full page load since the modal renders outside the Router
    window.location.href = '/settings';
  }, [onClose]);

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect a Google Sheet and create one view per worksheet.
      </Text>

      <Stack gap={12}>
        <TextInput
          label="Google Sheet URL or ID"
          placeholder="https://docs.google.com/spreadsheets/d/.../edit"
          value={sheetRef}
          onChange={setSheetRef}
          required
        />

        <TextInput
          label="Connection Name"
          placeholder="my_google_sheet"
          value={connectionName}
          onChange={setConnectionName}
          description="Used as the parent name in Data Explorer and for generated view names"
        />

        <Radio.Group
          label="Access Mode"
          value={accessMode}
          onChange={(value) => {
            setAccessMode(value as GSheetAccessMode);
            // Reset OAuth state when switching modes
            if (value !== 'oauth') {
              setOauthAuthenticated(false);
              setOauthExpiresIn(null);
            }
          }}
        >
          <Group mt="xs">
            <Radio value="public" label="Public" />
            <Radio value="oauth" label="Google Sign-In" />
            <Radio value="authorized" label="Bearer Token (manual)" />
          </Group>
        </Radio.Group>

        {accessMode === 'oauth' && !hasClientId && (
          <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
            <Text size="sm">
              Google Sign-In requires a Client ID.{' '}
              <Anchor component="button" size="sm" onClick={handleOpenSettings}>
                Configure it in Settings
              </Anchor>
            </Text>
          </Alert>
        )}

        {accessMode === 'oauth' && hasClientId && !oauthAuthenticated && (
          <Button
            variant="outline"
            onClick={handleOAuthSignIn}
            loading={isAuthenticating}
            disabled={isAuthenticating}
          >
            Sign in with Google
          </Button>
        )}

        {accessMode === 'oauth' && oauthAuthenticated && (
          <Group gap={8}>
            <IconCheck size={16} color="var(--mantine-color-green-6)" />
            <Text size="sm" c="green">
              Authenticated
            </Text>
          </Group>
        )}

        {accessMode === 'authorized' && (
          <TextInput
            label="Google API Bearer Token"
            type="password"
            placeholder="ya29...."
            value={accessToken}
            onChange={setAccessToken}
            description="Saved encrypted and used only for this Google Sheet connection."
            required
          />
        )}

        {accessMode === 'authorized' && !hasAccessToken && (
          <Text size="xs" c="icon-error">
            Enter a bearer token to use Authorized mode.
          </Text>
        )}

        {isTesting && (
          <Group gap={8}>
            <Loader size="xs" />
            <Text size="xs" c="text-secondary">
              Discovering worksheets...
            </Text>
          </Group>
        )}

        {discoveredSheets && discoveredSheets.length > 0 && (
          <Text size="xs" c="text-secondary">
            Found sheets: {discoveredSheets.join(', ')}
          </Text>
        )}
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" onClick={onBack}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          loading={isTesting}
          disabled={!sheetRef.trim() || isLoading || needsToken}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!sheetRef.trim() || needsToken}
        >
          Add Google Sheet
        </Button>
      </Group>
    </Stack>
  );
}
