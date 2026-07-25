import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { createGSheetSheetView } from '@controllers/db/data-source';
import { getDatabaseModel, getViews } from '@controllers/db/duckdb-meta';
import type { GSheetAccessMode } from '@models/data-source';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { deleteSecret, makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { addGSheetSheetDataSource, isFlatFileDataSource } from '@utils/data-source';
import { makeLocalEntryId } from '@utils/file-system';
import {
  buildDropGSheetSheetViewQuery,
  buildGSheetCsvExportUrl,
  buildGSheetSpreadsheetUrl,
  buildGSheetXlsxExportUrl,
  extractGSheetSpreadsheetId,
  GSHEET_SECRET_LABEL_PREFIX,
} from '@utils/gsheet';
import { buildDropGSheetSecretQuery, buildGSheetSecretName } from '@utils/gsheet-auth';
import { quote } from '@utils/helpers';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
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
  accessMode: GSheetAccessMode;
  accessToken: string;
  worksheetName: string;
  /** Absolute token expiry timestamp. Only used for `oauth` mode. */
  tokenExpiresAt?: number;
}

type CachedDiscovery = {
  /** Inputs that produced this result (for staleness check) */
  sheetRef: string;
  connectionName: string;
  accessMode: GSheetAccessMode;
  accessToken: string;
  worksheetName: string;
  result: GSheetDiscoverResult;
  cachedAt: number;
};

/** Discovery results are considered stale after 5 minutes. */
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;

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
      const worksheetName = params.worksheetName.trim();
      const connectionName = params.connectionName.trim();
      const spreadsheetId = extractGSheetSpreadsheetId(params.sheetRef);
      if (!spreadsheetId) {
        throw new Error('Enter a valid Google Sheets URL or spreadsheet ID');
      }

      const needsBearerToken = params.accessMode === 'authorized' || params.accessMode === 'oauth';
      if (needsBearerToken && !resolvedAccessToken) {
        throw new Error('A Google API bearer token is required for this access mode.');
      }

      // Return cached result if inputs haven't changed and cache is fresh
      const cached = cachedDiscoveryRef.current;
      if (
        cached &&
        cached.sheetRef === params.sheetRef &&
        cached.connectionName === connectionName &&
        cached.accessMode === params.accessMode &&
        cached.accessToken === resolvedAccessToken &&
        cached.worksheetName === worksheetName &&
        Date.now() - cached.cachedAt < DISCOVERY_CACHE_TTL_MS
      ) {
        return cached.result;
      }

      const exportUrl = buildGSheetXlsxExportUrl(spreadsheetId);
      const spreadsheetUrl = buildGSheetSpreadsheetUrl(spreadsheetId);
      const resolvedName = connectionName || `gsheet_${spreadsheetId.slice(0, 8)}`;

      if (!pool) {
        throw new Error('DuckDB is not ready. Please try again.');
      }

      let sheetNames: string[];

      if (needsBearerToken) {
        // Bind the token as a prepared-statement parameter so it never appears
        // in query text, DuckDB diagnostics, or optional query logging.
        const conn = await pool.getBackgroundConnection();
        try {
          const statement = await conn.prepare(`
            SELECT sheet_name
            FROM get_gsheet_sheets(
              ${quote(spreadsheetUrl, { single: true })},
              access_token := ?
            )
            WHERE sheet_type = 'GRID'
            ORDER BY sheet_index
          `);
          try {
            const result = await statement.query(resolvedAccessToken);
            sheetNames = result
              .toArray()
              .map((row) => String((row as { sheet_name?: unknown }).sheet_name ?? ''))
              .filter(Boolean);
          } finally {
            await statement.close();
          }
        } finally {
          await conn.close();
        }
      } else {
        const publicExportUrl = buildGSheetCsvExportUrl(spreadsheetId, worksheetName || undefined);
        await pool.query(
          `SELECT * FROM read_csv(${quote(publicExportUrl, { single: true })}, header=true) LIMIT 1`,
        );
        sheetNames = [worksheetName || 'First worksheet'];
      }

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
        connectionName,
        accessMode: params.accessMode,
        accessToken: resolvedAccessToken,
        worksheetName,
        result,
        cachedAt: Date.now(),
      };

      return result;
    },
    [pool],
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
        const catalogViews = (await getViews(pool, PERSISTENT_DB_NAME, 'main')) ?? [];
        const reservedViews = new Set([
          ...catalogViews,
          ...Array.from(dataSources.values())
            .filter(isFlatFileDataSource)
            .map((source) => source.viewName),
        ]);

        const newSources = [];

        const needsSecretStorage =
          params.accessMode === 'authorized' || params.accessMode === 'oauth';
        if (needsSecretStorage) {
          if (!resolvedAccessToken) {
            throw new Error('A Google API bearer token is required for this access mode.');
          }
          if (!_iDbConn) {
            throw new Error(
              'Secure storage is unavailable. Unable to persist Google Sheets token.',
            );
          }

          createdSecretRef = makeSecretId();
          createdDuckDBSecretName = buildGSheetSecretName(
            workbook.spreadsheetId,
            String(createdSecretRef),
          );
          await putSecret(_iDbConn, createdSecretRef, {
            label: `${GSHEET_SECRET_LABEL_PREFIX} ${workbook.resolvedName}`,
            data: { accessToken: resolvedAccessToken },
          });
        }

        // Compute token expiry timestamp for OAuth connections
        if (
          params.accessMode === 'oauth' &&
          params.tokenExpiresAt != null &&
          params.tokenExpiresAt <= Date.now()
        ) {
          throw new Error('OAuth token has already expired. Please sign in again.');
        }
        const tokenExpiresAt = params.accessMode === 'oauth' ? params.tokenExpiresAt : undefined;

        for (const sheetName of workbook.sheetNames) {
          const useFirstSheet = params.accessMode === 'public' && !params.worksheetName.trim();
          const dataSource = addGSheetSheetDataSource(
            {
              fileSourceId: sourceGroupId,
              spreadsheetId: workbook.spreadsheetId,
              spreadsheetName: workbook.resolvedName,
              spreadsheetUrl: workbook.spreadsheetUrl,
              exportUrl: workbook.exportUrl,
              sheetName,
              useFirstSheet,
              accessMode: params.accessMode,
              secretRef: createdSecretRef,
              tokenExpiresAt,
            },
            reservedViews,
          );

          await createGSheetSheetView(
            pool,
            workbook.spreadsheetUrl,
            useFirstSheet ? undefined : sheetName,
            dataSource.viewName,
            params.accessMode,
            resolvedAccessToken || undefined,
            createdSecretRef ? String(createdSecretRef) : undefined,
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

        if (_iDbConn) {
          await persistPutDataSources(_iDbConn, newSources);
        }

        useAppStore.setState(
          {
            dataSources: newDataSources,
            databaseMetadata: newMetadata,
          },
          false,
          'DatasourceWizard/addGoogleSheet',
        );

        showSuccess({
          title: 'Google Sheet added',
          message: `Added ${newSources.length} sheet${newSources.length === 1 ? '' : 's'} from ${workbook.resolvedName}.`,
        });
        onClose();
        return true;
      } catch (error) {
        for (const viewName of createdViewNames) {
          try {
            await pool?.query(buildDropGSheetSheetViewQuery(viewName));
          } catch {
            // Ignore cleanup errors and show the original failure
          }
        }
        createdViewNames = [];

        if (createdDuckDBSecretName) {
          try {
            await pool.query(buildDropGSheetSecretQuery(createdDuckDBSecretName));
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
