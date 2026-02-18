import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { createGSheetSheetView } from '@controllers/db/data-source';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { makeSecretId, putSecret, deleteSecret } from '@services/secret-store';
import { Stack, TextInput, Text, Button, Group, Alert, Radio, Loader } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { addGSheetSheetDataSource, isFlatFileDataSource } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { makeLocalEntryId } from '@utils/file-system';
import {
  buildCreateGSheetHttpSecretQuery,
  buildDropGSheetHttpSecretQuery,
  buildGSheetHttpSecretName,
} from '@utils/gsheet-auth';
import {
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  extractGSheetSpreadsheetId,
} from '@utils/gsheet';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { getXlsxSheetNames } from '@utils/xlsx';
import { useState } from 'react';

interface GoogleSheetConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

type GSheetDiscoverResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  exportUrl: string;
  resolvedName: string;
  sheetNames: string[];
};

const GSHEETS_ACCESS_TOKEN = import.meta.env.VITE_GSHEETS_ACCESS_TOKEN ?? '';

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return sanitizeErrorMessage(error.message);
  }
  return 'Unknown error';
}

export function GoogleSheetConfig({ pool, onBack, onClose }: GoogleSheetConfigProps) {
  const [sheetRef, setSheetRef] = useInputState('');
  const [connectionName, setConnectionName] = useInputState('');
  const [accessToken, setAccessToken] = useInputState(GSHEETS_ACCESS_TOKEN);
  const [accessMode, setAccessMode] = useState<'public' | 'authorized'>('public');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [discoveredSheets, setDiscoveredSheets] = useState<string[] | null>(null);

  const resolvedAccessToken = (accessToken || GSHEETS_ACCESS_TOKEN).trim();
  const hasAccessToken = resolvedAccessToken.length > 0;

  const discoverWorkbook = async (): Promise<GSheetDiscoverResult> => {
    const spreadsheetId = extractGSheetSpreadsheetId(sheetRef);
    if (!spreadsheetId) {
      throw new Error('Enter a valid Google Sheets URL or spreadsheet ID');
    }

    if (accessMode === 'authorized' && !resolvedAccessToken) {
      throw new Error(
        'Authorized mode requires a Google API bearer token.',
      );
    }

    const exportUrl = buildGSheetXlsxExportUrl(spreadsheetId);
    const spreadsheetUrl = buildGSheetSpreadsheetUrl(spreadsheetId);
    const resolvedName = connectionName.trim() || `gsheet_${spreadsheetId.slice(0, 8)}`;

    const headers =
      accessMode === 'authorized'
        ? {
            Authorization: `Bearer ${resolvedAccessToken}`,
          }
        : undefined;

    let response: Response;
    try {
      response = await fetch(exportUrl, { headers });
    } catch (error) {
      throw new Error(
        'Unable to fetch spreadsheet export. This is usually a CORS or access-permission issue.',
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch spreadsheet export (${response.status})`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('Spreadsheet export returned an empty file');
    }

    const workbookFile = new File([blob], `${spreadsheetId}.xlsx`, {
      type:
        blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const sheetNames = await getXlsxSheetNames(workbookFile);
    if (!sheetNames.length) {
      throw new Error('No sheets found in this Google Sheet');
    }

    return {
      spreadsheetId,
      spreadsheetUrl,
      exportUrl,
      resolvedName,
      sheetNames,
    };
  };

  const handleTest = async () => {
    if (isTesting || isLoading) return;
    setIsTesting(true);
    try {
      const result = await discoverWorkbook();
      setDiscoveredSheets(result.sheetNames);
      showSuccess({
        title: 'Connection successful',
        message: `Found ${result.sheetNames.length} sheet${result.sheetNames.length === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      setDiscoveredSheets(null);
      showError({
        title: 'Connection failed',
        message: toFriendlyError(error),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAdd = async () => {
    if (!pool) {
      showError({
        title: 'App not ready',
        message: 'Please wait for the app to initialize',
      });
      return;
    }

    setIsLoading(true);
    let createdViewNames: string[] = [];
    let createdSecretRef: ReturnType<typeof makeSecretId> | undefined;
    let createdDuckDBSecretName: string | undefined;
    let iDbConnForCleanup = useAppStore.getState()._iDbConn;
    try {
      const workbook = await discoverWorkbook();
      const sourceGroupId = makeLocalEntryId();
      const { dataSources, databaseMetadata, _iDbConn } = useAppStore.getState();
      iDbConnForCleanup = _iDbConn;
      const reservedViews = new Set(
        Array.from(dataSources.values())
          .filter(isFlatFileDataSource)
          .map((source) => source.viewName),
      );

      const newSources = [];

      if (accessMode === 'authorized') {
        if (!resolvedAccessToken) {
          throw new Error('Authorized mode requires a Google API bearer token.');
        }
        if (!_iDbConn) {
          throw new Error('Secure storage is unavailable. Unable to persist Google Sheets token.');
        }

        createdSecretRef = makeSecretId();
        await putSecret(_iDbConn, createdSecretRef, {
          label: `Google Sheet: ${workbook.resolvedName}`,
          data: { accessToken: resolvedAccessToken },
        });

        createdDuckDBSecretName = buildGSheetHttpSecretName(sourceGroupId);
        await pool.query(
          buildCreateGSheetHttpSecretQuery(
            createdDuckDBSecretName,
            resolvedAccessToken,
            workbook.spreadsheetId,
          ),
        );
      }

      for (const sheetName of workbook.sheetNames) {
        const dataSource = addGSheetSheetDataSource(
          {
            fileSourceId: sourceGroupId,
            spreadsheetId: workbook.spreadsheetId,
            spreadsheetName: workbook.resolvedName,
            spreadsheetUrl: workbook.spreadsheetUrl,
            exportUrl: workbook.exportUrl,
            sheetName,
            accessMode,
            secretRef: createdSecretRef,
          },
          reservedViews,
        );

        await createGSheetSheetView(
          pool,
          workbook.spreadsheetUrl,
          sheetName,
          dataSource.viewName,
          accessMode,
        );
        reservedViews.add(dataSource.viewName);
        createdViewNames.push(dataSource.viewName);
        newSources.push(dataSource);
      }

      const newDataSources = new Map(dataSources);
      newSources.forEach((source) => {
        newDataSources.set(source.id, source);
      });

      const updatedMainMetadata = await getDatabaseModel(pool, [PERSISTENT_DB_NAME], ['main']);
      const newMetadata = new Map(databaseMetadata);
      if (updatedMainMetadata.has(PERSISTENT_DB_NAME)) {
        newMetadata.set(PERSISTENT_DB_NAME, updatedMainMetadata.get(PERSISTENT_DB_NAME)!);
      }

      useAppStore.setState(
        {
          dataSources: newDataSources,
          databaseMetadata: newMetadata,
        },
        false,
        'DatasourceWizard/addGoogleSheet',
      );

      if (_iDbConn) {
        await persistPutDataSources(_iDbConn, newSources);
      }

      showSuccess({
        title: 'Google Sheet added',
        message: `Added ${newSources.length} sheet${newSources.length === 1 ? '' : 's'} from ${workbook.resolvedName}.`,
      });
      onClose();
    } catch (error) {
      for (const viewName of createdViewNames) {
        try {
          await pool?.query(`DROP VIEW IF EXISTS ${toDuckDBIdentifier(viewName)}`);
        } catch {
          // Ignore cleanup errors and show the original failure
        }
      }
      createdViewNames = [];

      if (createdDuckDBSecretName) {
        try {
          await pool?.query(buildDropGSheetHttpSecretQuery(createdDuckDBSecretName));
        } catch {
          // Ignore secret cleanup errors and surface the original failure.
        }
      }
      if (createdSecretRef && iDbConnForCleanup) {
        try {
          await deleteSecret(iDbConnForCleanup, createdSecretRef);
        } catch {
          // Ignore secret cleanup errors and surface the original failure.
        }
      }

      showError({
        title: 'Failed to add Google Sheet',
        message: toFriendlyError(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect a Google Sheet and create one view per worksheet.
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        Authorized mode stores a per-connection token in the encrypted secret store.
      </Alert>

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
          disabled={!sheetRef.trim() || isLoading || (accessMode === 'authorized' && !hasAccessToken)}
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
