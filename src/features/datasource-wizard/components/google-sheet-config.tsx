import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { createGSheetSheetView } from '@controllers/db/data-source';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { Stack, TextInput, Text, Button, Group, Alert, Radio, Loader } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { addGSheetSheetDataSource, isFlatFileDataSource } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { makeLocalEntryId } from '@utils/file-system';
import {
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  extractGSheetSpreadsheetId,
} from '@utils/gsheet';
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
    return error.message;
  }
  return 'Unknown error';
}

export function GoogleSheetConfig({ pool, onBack, onClose }: GoogleSheetConfigProps) {
  const [sheetRef, setSheetRef] = useInputState('');
  const [connectionName, setConnectionName] = useInputState('');
  const [accessMode, setAccessMode] = useState<'public' | 'authorized'>('public');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [discoveredSheets, setDiscoveredSheets] = useState<string[] | null>(null);

  const hasAccessToken = GSHEETS_ACCESS_TOKEN.trim().length > 0;

  const discoverWorkbook = async (): Promise<GSheetDiscoverResult> => {
    const spreadsheetId = extractGSheetSpreadsheetId(sheetRef);
    if (!spreadsheetId) {
      throw new Error('Enter a valid Google Sheets URL or spreadsheet ID');
    }

    if (accessMode === 'authorized' && !hasAccessToken) {
      throw new Error(
        'Authorized mode requires VITE_GSHEETS_ACCESS_TOKEN to be set in the environment.',
      );
    }

    const exportUrl = buildGSheetXlsxExportUrl(spreadsheetId);
    const spreadsheetUrl = buildGSheetSpreadsheetUrl(spreadsheetId);
    const resolvedName = connectionName.trim() || `gsheet_${spreadsheetId.slice(0, 8)}`;

    const headers =
      accessMode === 'authorized'
        ? {
            Authorization: `Bearer ${GSHEETS_ACCESS_TOKEN.trim()}`,
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
    try {
      const workbook = await discoverWorkbook();
      const sourceGroupId = makeLocalEntryId();
      const { dataSources, databaseMetadata, _iDbConn } = useAppStore.getState();
      const reservedViews = new Set(
        Array.from(dataSources.values())
          .filter(isFlatFileDataSource)
          .map((source) => source.viewName),
      );

      const newSources = [];

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
        For private sheets, set <code>VITE_GSHEETS_ACCESS_TOKEN</code> and choose Authorized.
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

        {accessMode === 'authorized' && !hasAccessToken && (
          <Text size="xs" c="icon-error">
            Authorized mode is unavailable because VITE_GSHEETS_ACCESS_TOKEN is not set.
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
          disabled={!sheetRef.trim() || isLoading}
        >
          Test Connection
        </Button>
        <Button onClick={handleAdd} loading={isLoading || isTesting} disabled={!sheetRef.trim()}>
          Add Google Sheet
        </Button>
      </Group>
    </Stack>
  );
}
