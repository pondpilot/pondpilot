import { showError } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, TextInput, Text, Button, Group, Radio, Loader } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import type { GSheetAccessMode } from '@models/data-source';
import { requestGoogleAccessToken } from '@services/google-identity-services';
import { useAppStore } from '@store/app-store';
import { IconBrandGoogle, IconCheck } from '@tabler/icons-react';
import { getGoogleOAuthClientId } from '@utils/google-oauth-config';
import { useState, useCallback, useMemo } from 'react';

import { useGSheetConnection } from '../hooks/use-gsheet-connection';

interface GoogleSheetConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export function GoogleSheetConfig({ pool, onClose, onNavigate }: GoogleSheetConfigProps) {
  const [sheetRef, setSheetRef] = useInputState('');
  const [connectionName, setConnectionName] = useInputState('');
  const [accessToken, setAccessToken] = useInputState('');
  const [accessMode, setAccessMode] = useState<GSheetAccessMode>('public');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const cachedToken = useAppStore((s) => s.googleOAuthToken);

  // Consider the cached token valid if it has >60s remaining
  const hasCachedToken = useMemo(
    () => cachedToken != null && cachedToken.expiresAt > Date.now() + 60_000,
    [cachedToken],
  );

  const oauthAuthenticated = hasCachedToken;
  const oauthAccessToken = cachedToken?.accessToken ?? '';
  const oauthExpiresIn = cachedToken
    ? Math.max(0, Math.floor((cachedToken.expiresAt - Date.now()) / 1000))
    : undefined;

  const { isLoading, isTesting, discoveredSheets, testConnection, addGoogleSheet } =
    useGSheetConnection(pool);

  const resolvedAccessToken = accessToken.trim();
  const hasAccessToken = resolvedAccessToken.length > 0;
  const clientId = getGoogleOAuthClientId();
  const hasClientId = clientId.length > 0;

  const needsToken =
    (accessMode === 'authorized' && !hasAccessToken) ||
    (accessMode === 'oauth' && !oauthAuthenticated);

  const effectiveAccessToken = accessMode === 'oauth' ? oauthAccessToken : accessToken;

  const params = {
    sheetRef,
    connectionName,
    accessMode,
    accessToken: effectiveAccessToken,
    tokenExpiresIn: oauthExpiresIn,
  };

  const handleTest = () => testConnection(params);
  const handleAdd = () => addGoogleSheet(params, onClose);

  const handleOAuthSignIn = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const result = await requestGoogleAccessToken(clientId);
      setAccessToken(result.accessToken);
      useAppStore.setState(
        {
          googleOAuthToken: {
            accessToken: result.accessToken,
            expiresAt: Date.now() + result.expiresIn * 1000,
          },
        },
        false,
        'GoogleSheetConfig/oauthSignIn',
      );
    } catch (error) {
      showError({
        title: 'Google Sign-In failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, [clientId, setAccessToken]);

  const handleOpenSettings = useCallback(() => {
    if (onNavigate) {
      onNavigate('/settings#google-sheets');
    } else {
      onClose();
      window.location.href = '/settings#google-sheets';
    }
  }, [onClose, onNavigate]);

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
          onChange={(value) => setAccessMode(value as GSheetAccessMode)}
        >
          <Group mt="xs">
            <Radio value="public" label="Public" />
            <Radio value="oauth" label="Google Sign-In" />
            <Radio value="authorized" label="Bearer Token (manual)" />
          </Group>
        </Radio.Group>

        {accessMode === 'oauth' && !oauthAuthenticated && (
          <Button
            variant="outline"
            size="md"
            leftSection={<IconBrandGoogle size={18} />}
            onClick={hasClientId ? handleOAuthSignIn : handleOpenSettings}
            loading={isAuthenticating}
            disabled={isAuthenticating}
          >
            {hasClientId ? 'Sign in with Google' : 'Configure Google Sign-In in Settings'}
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
