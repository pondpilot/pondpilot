/**
 * DuckLake Catalog Utilities
 *
 * Utilities for managing DuckLake catalog connections.
 * DuckLake catalogs are attached via URL using the DuckLake extension,
 * which is autoloaded when the `ducklake:` prefix is used in ATTACH.
 */

import { showError, showSuccess } from '@components/app-notifications';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { deleteTab } from '@controllers/tab';
import { DuckLakeCatalog, PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { useAppStore } from '@store/app-store';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { executeWithRetry } from '@utils/connection-manager';
import {
  wrapWithCorsProxyPathBased,
  isRemoteUrl,
  convertS3ToHttps,
} from '@utils/cors-proxy-config';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';
import { buildDetachQuery } from '@utils/sql-builder';
import { escapeSqlStringValue } from '@utils/sql-security';

/**
 * Derives a catalog alias from a DuckLake URL.
 * Extracts the last meaningful path segment before the catalog file.
 *
 * Examples:
 *   https://example.com/sprouts/catalog.ducklake → sprouts
 *   s3://bucket/my-data/catalog.ducklake → my_data
 *   https://example.com/catalog.ducklake → catalog
 */
export function deriveDuckLakeAlias(url: string): string {
  try {
    // Strip query params and hash
    const cleanUrl = url.split('?')[0].split('#')[0];
    const segments = cleanUrl.split('/').filter(Boolean);

    if (segments.length === 0) return 'ducklake';

    // Find the last segment that isn't the catalog file itself
    const lastSegment = segments[segments.length - 1];
    const isFile = lastSegment.includes('.');

    let candidate: string;
    if (isFile && segments.length > 1) {
      // Use the parent directory name
      candidate = segments[segments.length - 2];
    } else if (isFile) {
      // Only the file name — use its stem
      candidate = lastSegment.replace(/\.[^.]+$/, '');
    } else {
      candidate = lastSegment;
    }

    // Sanitize to valid identifier: replace non-alphanumeric with underscore
    const sanitized = candidate
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .toLowerCase();

    return sanitized || 'ducklake';
  } catch {
    return 'ducklake';
  }
}

/**
 * Builds a DuckLake ATTACH query.
 *
 * DuckLake catalogs are attached using:
 *   ATTACH 'ducklake:<url>' AS <alias> (READ_ONLY)
 *
 * The `ducklake:` prefix triggers the extension autoload.
 */
export function buildDuckLakeAttachQuery(
  url: string,
  catalogAlias: string,
  options?: { readOnly?: boolean; useCorsProxy?: boolean },
): string {
  let finalUrl = url;

  if (options?.useCorsProxy === true && isRemoteUrl(url)) {
    const httpsUrl = convertS3ToHttps(url);
    finalUrl = wrapWithCorsProxyPathBased(httpsUrl || url);
  }

  const ducklakeUrl = `ducklake:${finalUrl}`;
  const escapedUrl = quote(ducklakeUrl, { single: true });
  const escapedAlias = toDuckDBIdentifier(catalogAlias);
  const readOnlyClause = options?.readOnly !== false ? ' (READ_ONLY)' : '';

  return `ATTACH ${escapedUrl} AS ${escapedAlias}${readOnlyClause}`;
}

/**
 * Attaches a DuckLake catalog and verifies it is present in duckdb_databases.
 * Shared logic used by both the wizard and reconnect paths.
 */
export async function attachAndVerifyDuckLakeCatalog(options: {
  pool: AsyncDuckDBConnectionPool;
  url: string;
  catalogAlias: string;
  readOnly?: boolean;
  useCorsProxy?: boolean;
  settleDelayMs?: number;
  maxVerifyAttempts?: number;
}): Promise<void> {
  const {
    pool,
    url,
    catalogAlias,
    readOnly = true,
    useCorsProxy = false,
    settleDelayMs = 0,
    maxVerifyAttempts = 5,
  } = options;

  const attachQuery = buildDuckLakeAttachQuery(url, catalogAlias, { readOnly, useCorsProxy });

  try {
    await executeWithRetry(pool, attachQuery, {
      maxRetries: 3,
      timeout: 30000,
      retryDelay: 2000,
      exponentialBackoff: true,
    });
  } catch (attachError: any) {
    const errorMsg = attachError.message || '';
    const isAlreadyAttached =
      errorMsg.includes('already in use') ||
      errorMsg.includes('already attached') ||
      errorMsg.includes('Unique file handle conflict');

    if (!isAlreadyAttached) {
      throw attachError;
    }
  }

  if (settleDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
  }

  // Verify the catalog is attached
  const checkQuery = `SELECT database_name FROM duckdb_databases() WHERE database_name = '${escapeSqlStringValue(catalogAlias)}'`;

  let dbFound = false;
  let attempts = 0;

  while (!dbFound && attempts < maxVerifyAttempts) {
    try {
      const result = await pool.query(checkQuery);
      if (result && result.numRows > 0) {
        dbFound = true;
      } else {
        throw new Error('Catalog not found in database list');
      }
    } catch (error) {
      attempts += 1;
      if (attempts >= maxVerifyAttempts) {
        throw new Error(
          `Catalog ${catalogAlias} could not be verified after ${maxVerifyAttempts} attempts`,
        );
      }
      console.warn(`Attempt ${attempts}: Catalog not ready yet, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Updates the connection state of a DuckLake catalog
 */
export function updateDuckLakeConnectionState(
  catalogId: PersistentDataSourceId,
  state: DuckLakeCatalog['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(catalogId);

  if (!dataSource || dataSource.type !== 'ducklake-catalog') {
    return;
  }

  const updated: DuckLakeCatalog = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(catalogId, updated);
  useAppStore.setState(
    { dataSources: newDataSources },
    false,
    'DuckLakeCatalog/updateConnectionState',
  );
}

/**
 * Attempts to reconnect a DuckLake catalog
 */
export async function reconnectDuckLakeCatalog(
  pool: AsyncDuckDBConnectionPool,
  catalog: DuckLakeCatalog,
): Promise<boolean> {
  try {
    updateDuckLakeConnectionState(catalog.id, 'connecting');

    await attachAndVerifyDuckLakeCatalog({
      pool,
      url: catalog.url,
      catalogAlias: catalog.catalogAlias,
      readOnly: catalog.readOnly ?? true,
      useCorsProxy: catalog.useCorsProxy ?? false,
    });

    updateDuckLakeConnectionState(catalog.id, 'connected');

    // Load metadata
    try {
      const metadata = await getDatabaseModel(pool, [catalog.catalogAlias]);
      const currentMetadata = useAppStore.getState().databaseMetadata;
      const newMetadata = new Map(currentMetadata);

      for (const [dbName, dbModel] of metadata) {
        newMetadata.set(dbName, dbModel);
      }

      useAppStore.setState(
        { databaseMetadata: newMetadata },
        false,
        'DuckLakeCatalog/reconnectMetadata',
      );
    } catch (metadataError) {
      console.error('Failed to load metadata after DuckLake reconnection:', metadataError);
    }

    showSuccess({
      title: 'Reconnected',
      message: `Successfully reconnected to DuckLake catalog '${catalog.catalogAlias}'`,
    });

    return true;
  } catch (error) {
    let errorMessage: string;

    if (error instanceof MaxRetriesExceededError) {
      errorMessage = `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    updateDuckLakeConnectionState(catalog.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to DuckLake catalog '${catalog.catalogAlias}': ${errorMessage}`,
    });

    return false;
  }
}

/**
 * Disconnects a DuckLake catalog
 */
export async function disconnectDuckLakeCatalog(
  pool: AsyncDuckDBConnectionPool,
  catalog: DuckLakeCatalog,
): Promise<void> {
  try {
    const detachQuery = buildDetachQuery(catalog.catalogAlias, true);
    await pool.query(detachQuery);

    updateDuckLakeConnectionState(catalog.id, 'disconnected');

    // Remove database metadata
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(catalog.catalogAlias);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'DuckLakeCatalog/disconnect');

    // Close related tabs
    const { tabs } = useAppStore.getState();
    const tabsToClose: TabId[] = [];

    for (const [tabId, tab] of tabs) {
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === catalog.id
      ) {
        tabsToClose.push(tabId);
      }

      if (tab.type === 'schema-browser' && tab.sourceType === 'db' && tab.sourceId === catalog.id) {
        tabsToClose.push(tabId);
      }
    }

    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    showSuccess({
      title: 'Disconnected',
      message: `Successfully disconnected from DuckLake catalog '${catalog.catalogAlias}'`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from DuckLake catalog '${catalog.catalogAlias}': ${errorMessage}`,
    });

    updateDuckLakeConnectionState(catalog.id, 'disconnected', errorMessage);
  }
}
