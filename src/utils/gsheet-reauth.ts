import { showError, showWarningWithAction } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import type { GSheetSheetView, PersistentDataSourceId } from '@models/data-source';
import { requestGoogleAccessToken } from '@services/google-identity-services';
import { putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { getGoogleOAuthClientId } from '@utils/google-oauth-config';
import { GSHEET_SECRET_LABEL_PREFIX } from '@utils/gsheet';
import { buildCreateGSheetHttpSecretQuery, buildGSheetHttpSecretName } from '@utils/gsheet-auth';

/**
 * Trigger a re-authorization flow for an OAuth Google Sheet connection.
 *
 * Opens the Google Sign-In popup, obtains a fresh token, and updates
 * both the encrypted secret store and the DuckDB HTTP secret in-place.
 *
 * @param pool - DuckDB connection pool for updating HTTP secrets
 * @param dataSource - Any GSheetSheetView from the connection group
 */
export async function reauthGSheetOAuth(
  pool: { query: (sql: string) => Promise<unknown> },
  dataSource: GSheetSheetView,
): Promise<boolean> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    showError({
      title: 'Google Sign-In not configured',
      message: 'Set up your Google OAuth Client ID in Settings first.',
    });
    return false;
  }

  try {
    const result = await requestGoogleAccessToken(clientId);
    const { _iDbConn, dataSources } = useAppStore.getState();
    if (!_iDbConn) {
      throw new Error('Secure storage is unavailable.');
    }

    // Update encrypted secret store
    if (dataSource.secretRef) {
      await putSecret(_iDbConn, dataSource.secretRef, {
        label: `${GSHEET_SECRET_LABEL_PREFIX} ${dataSource.spreadsheetName}`,
        data: { accessToken: result.accessToken },
      });
    } else {
      console.warn('GSheet OAuth source missing secretRef; cannot update encrypted token.');
    }

    // Recreate DuckDB HTTP secret (CREATE OR REPLACE)
    const secretName = buildGSheetHttpSecretName(dataSource.fileSourceId);
    await pool.query(
      buildCreateGSheetHttpSecretQuery(secretName, result.accessToken, dataSource.spreadsheetId),
    );

    // Update tokenExpiresAt on all data sources from same connection
    const newExpiresAt = Date.now() + result.expiresIn * 1000;
    const updatedSources: GSheetSheetView[] = [];
    const newDataSources = new Map(dataSources);

    for (const [id, ds] of dataSources) {
      if (
        ds.type === 'gsheet-sheet' &&
        ds.fileSourceId === dataSource.fileSourceId &&
        ds.accessMode === 'oauth'
      ) {
        const updated: GSheetSheetView = {
          ...(ds as GSheetSheetView),
          tokenExpiresAt: newExpiresAt,
        };
        newDataSources.set(id as PersistentDataSourceId, updated);
        updatedSources.push(updated);
      }
    }

    useAppStore.setState({ dataSources: newDataSources }, false, 'GSheetReauth/updateToken');

    if (updatedSources.length > 0) {
      await persistPutDataSources(_iDbConn, updatedSources);
    }

    return true;
  } catch (error) {
    showError({
      title: 'Re-authorization failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Show a warning notification for expired OAuth Google Sheet tokens.
 * Called during restore or when a query returns 401.
 */
export function notifyGSheetTokenExpired(
  pool: { query: (sql: string) => Promise<unknown> },
  dataSource: GSheetSheetView,
): void {
  showWarningWithAction({
    title: 'Google session expired',
    message: `Token for "${dataSource.spreadsheetName}" has expired. Re-authorize to continue querying.`,
    action: {
      label: 'Re-authorize',
      onClick: () => {
        reauthGSheetOAuth(pool, dataSource);
      },
    },
  });
}
