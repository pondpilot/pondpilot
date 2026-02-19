import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { createGSheetSheetView } from '@controllers/db/data-source';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { deleteSecret, makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { addGSheetSheetDataSource, isFlatFileDataSource } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { makeLocalEntryId } from '@utils/file-system';
import {
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  extractGSheetSpreadsheetId,
} from '@utils/gsheet';
import {
  buildCreateGSheetHttpSecretQuery,
  buildDropGSheetHttpSecretQuery,
  buildGSheetHttpSecretName,
} from '@utils/gsheet-auth';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { getXlsxSheetNames } from '@utils/xlsx';
import { useState, useCallback, useRef } from 'react';

export type GSheetDiscoverResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  exportUrl: string;
  resolvedName: string;
  sheetNames: string[];
};

export interface GSheetConnectionParams {
  sheetRef: string;
  connectionName: string;
  accessMode: 'public' | 'authorized';
  accessToken: string;
}

type CachedDiscovery = {
  /** Inputs that produced this result (for staleness check) */
  sheetRef: string;
  accessMode: 'public' | 'authorized';
  accessToken: string;
  result: GSheetDiscoverResult;
};

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return sanitizeErrorMessage(error.message);
  }
  return 'Unknown error';
}

export function useGSheetConnection(pool: AsyncDuckDBConnectionPool | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [discoveredSheets, setDiscoveredSheets] = useState<string[] | null>(null);

  // Synchronous refs guard against double-click races
  const testingRef = useRef(false);
  const loadingRef = useRef(false);

  // Cache the last successful discovery to reuse between Test and Add
  const cachedDiscoveryRef = useRef<CachedDiscovery | null>(null);

  const discoverWorkbook = useCallback(
    async (params: GSheetConnectionParams): Promise<GSheetDiscoverResult> => {
      const resolvedAccessToken = params.accessToken.trim();
      const spreadsheetId = extractGSheetSpreadsheetId(params.sheetRef);
      if (!spreadsheetId) {
        throw new Error('Enter a valid Google Sheets URL or spreadsheet ID');
      }

      if (params.accessMode === 'authorized' && !resolvedAccessToken) {
        throw new Error('Authorized mode requires a Google API bearer token.');
      }

      // Return cached result if inputs haven't changed
      const cached = cachedDiscoveryRef.current;
      if (
        cached &&
        cached.sheetRef === params.sheetRef &&
        cached.accessMode === params.accessMode &&
        cached.accessToken === resolvedAccessToken
      ) {
        return cached.result;
      }

      const exportUrl = buildGSheetXlsxExportUrl(spreadsheetId);
      const spreadsheetUrl = buildGSheetSpreadsheetUrl(spreadsheetId);
      const resolvedName = params.connectionName.trim() || `gsheet_${spreadsheetId.slice(0, 8)}`;

      const headers =
        params.accessMode === 'authorized'
          ? { Authorization: `Bearer ${resolvedAccessToken}` }
          : undefined;

      let response: Response;
      try {
        response = await fetch(exportUrl, { headers });
      } catch {
        throw new Error(
          'Unable to fetch spreadsheet export. This is usually a CORS or access-permission issue.',
        );
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch spreadsheet export (${response.status} ${response.statusText})`,
        );
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error('Spreadsheet export returned an empty file');
      }

      const workbookFile = new File([blob], `${spreadsheetId}.xlsx`, {
        type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const sheetNames = await getXlsxSheetNames(workbookFile);
      if (!sheetNames.length) {
        throw new Error('No sheets found in this Google Sheet');
      }

      const result: GSheetDiscoverResult = {
        spreadsheetId,
        spreadsheetUrl,
        exportUrl,
        resolvedName,
        sheetNames,
      };

      cachedDiscoveryRef.current = {
        sheetRef: params.sheetRef,
        accessMode: params.accessMode,
        accessToken: resolvedAccessToken,
        result,
      };

      return result;
    },
    [],
  );

  const testConnection = useCallback(
    async (params: GSheetConnectionParams): Promise<boolean> => {
      if (testingRef.current || loadingRef.current) return false;
      testingRef.current = true;
      setIsTesting(true);

      try {
        const result = await discoverWorkbook(params);
        setDiscoveredSheets(result.sheetNames);
        showSuccess({
          title: 'Connection successful',
          message: `Found ${result.sheetNames.length} sheet${result.sheetNames.length === 1 ? '' : 's'}.`,
        });
        return true;
      } catch (error) {
        setDiscoveredSheets(null);
        // Invalidate cache on failure so the next attempt refetches
        cachedDiscoveryRef.current = null;
        showError({
          title: 'Connection failed',
          message: toFriendlyError(error),
        });
        return false;
      } finally {
        testingRef.current = false;
        setIsTesting(false);
      }
    },
    [discoverWorkbook],
  );

  const addGoogleSheet = useCallback(
    async (params: GSheetConnectionParams, onClose: () => void): Promise<boolean> => {
      if (!pool || loadingRef.current || testingRef.current) return false;
      loadingRef.current = true;
      setIsLoading(true);

      const resolvedAccessToken = params.accessToken.trim();
      let createdViewNames: string[] = [];
      let createdSecretRef: ReturnType<typeof makeSecretId> | undefined;
      let createdDuckDBSecretName: string | undefined;
      let iDbConnForCleanup = useAppStore.getState()._iDbConn;

      try {
        const workbook = await discoverWorkbook(params);
        const sourceGroupId = makeLocalEntryId();
        const { dataSources, databaseMetadata, _iDbConn } = useAppStore.getState();
        iDbConnForCleanup = _iDbConn;
        const reservedViews = new Set(
          Array.from(dataSources.values())
            .filter(isFlatFileDataSource)
            .map((source) => source.viewName),
        );

        const newSources = [];

        if (params.accessMode === 'authorized') {
          if (!resolvedAccessToken) {
            throw new Error('Authorized mode requires a Google API bearer token.');
          }
          if (!_iDbConn) {
            throw new Error(
              'Secure storage is unavailable. Unable to persist Google Sheets token.',
            );
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
              accessMode: params.accessMode,
              secretRef: createdSecretRef,
            },
            reservedViews,
          );

          await createGSheetSheetView(
            pool,
            workbook.spreadsheetUrl,
            sheetName,
            dataSource.viewName,
            params.accessMode,
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
        return true;
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
        return false;
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [pool, discoverWorkbook],
  );

  return { isLoading, isTesting, discoveredSheets, testConnection, addGoogleSheet };
}
