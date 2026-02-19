import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Stack, TextInput, Text, Button, Group, Radio, Loader } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { useState } from 'react';

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
  const [accessMode, setAccessMode] = useState<'public' | 'authorized'>('public');

  const { isLoading, isTesting, discoveredSheets, testConnection, addGoogleSheet } =
    useGSheetConnection(pool);

  const resolvedAccessToken = accessToken.trim();
  const hasAccessToken = resolvedAccessToken.length > 0;

  const params = {
    sheetRef,
    connectionName,
    accessMode,
    accessToken,
  };

  const handleTest = () => testConnection(params);
  const handleAdd = () => addGoogleSheet(params, onClose);

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
          onChange={(value) => setAccessMode(value as 'public' | 'authorized')}
        >
          <Group mt="xs">
            <Radio value="public" label="Public" />
            <Radio value="authorized" label="Authorized (Bearer token)" />
          </Group>
        </Radio.Group>

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
          disabled={
            !sheetRef.trim() || isLoading || (accessMode === 'authorized' && !hasAccessToken)
          }
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading || isTesting}
          disabled={!sheetRef.trim() || (accessMode === 'authorized' && !hasAccessToken)}
        >
          Add Google Sheet
        </Button>
      </Group>
    </Stack>
  );
}
