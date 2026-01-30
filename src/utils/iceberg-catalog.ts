/**
 * Iceberg Catalog Utilities
 *
 * Utilities for managing Iceberg REST catalog connections and lifecycle.
 * Mirrors the structure of remote-database.ts.
 */

import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { deleteTab } from '@controllers/tab';
import { IcebergCatalog, PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { executeWithRetry } from '@utils/connection-manager';
import {
  buildIcebergSecretQuery,
  buildDropSecretQuery,
  buildIcebergAttachQuery,
} from '@utils/iceberg-sql-builder';

/**
 * Updates the connection state of an Iceberg catalog in the store.
 */
export function updateIcebergCatalogConnectionState(
  id: PersistentDataSourceId,
  state: IcebergCatalog['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(id);

  if (!dataSource || dataSource.type !== 'iceberg-catalog') {
    return;
  }

  const updated: IcebergCatalog = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(id, updated);
  useAppStore.setState(
    { dataSources: newDataSources },
    false,
    'IcebergCatalog/updateConnectionState',
  );
}

export interface IcebergCredentials {
  authType: IcebergCatalog['authType'];
  clientId?: string;
  clientSecret?: string;
  oauth2ServerUri?: string;
  token?: string;
  awsKeyId?: string;
  awsSecret?: string;
  defaultRegion?: string;
}

/**
 * Reconnects an Iceberg catalog after user provides credentials.
 * Creates a new secret, attaches the catalog, verifies, and loads metadata.
 */
export async function reconnectIcebergCatalog(
  pool: any,
  catalog: IcebergCatalog,
  credentials: IcebergCredentials,
): Promise<boolean> {
  try {
    updateIcebergCatalogConnectionState(catalog.id, 'connecting');

    // Create secret
    const isManagedEndpoint =
      catalog.endpointType === 'GLUE' || catalog.endpointType === 'S3_TABLES';
    const secretQuery = buildIcebergSecretQuery({
      secretName: catalog.secretName,
      authType: credentials.authType,
      useS3SecretType: isManagedEndpoint,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      oauth2ServerUri: credentials.oauth2ServerUri,
      token: credentials.token,
      awsKeyId: credentials.awsKeyId,
      awsSecret: credentials.awsSecret,
      defaultRegion: credentials.defaultRegion,
    });
    await pool.query(secretQuery);

    // Attach catalog
    const attachQuery = buildIcebergAttachQuery({
      warehouseName: catalog.warehouseName,
      catalogAlias: catalog.catalogAlias,
      endpoint: catalog.endpointType ? undefined : catalog.endpoint,
      endpointType: catalog.endpointType,
      secretName: catalog.secretName,
      useCorsProxy: catalog.useCorsProxy,
    });

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

    // Wait for catalog to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify the catalog is attached
    const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${catalog.catalogAlias}'`;
    let dbFound = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!dbFound && attempts < maxAttempts) {
      try {
        const result = await pool.query(checkQuery);
        if (result && result.numRows > 0) {
          dbFound = true;
        } else {
          throw new Error('Catalog not found in duckdb_databases');
        }
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          throw new Error(
            `Catalog ${catalog.catalogAlias} could not be verified after ${maxAttempts} attempts`,
          );
        }
        console.warn(`Attempt ${attempts}: Catalog not ready yet, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Persist updated credentials to the catalog model
    const updatedCatalog: IcebergCatalog = {
      ...catalog,
      connectionState: 'connected',
      connectionError: undefined,
      authType: credentials.authType,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      oauth2ServerUri: credentials.oauth2ServerUri,
      token: credentials.token,
      awsKeyId: credentials.awsKeyId,
      awsSecret: credentials.awsSecret,
      defaultRegion: credentials.defaultRegion,
    };

    const { dataSources, _iDbConn } = useAppStore.getState();
    const newDataSources = new Map(dataSources);
    newDataSources.set(catalog.id, updatedCatalog);
    useAppStore.setState(
      { dataSources: newDataSources },
      false,
      'IcebergCatalog/reconnectCredentials',
    );

    if (_iDbConn) {
      await persistPutDataSources(_iDbConn, [updatedCatalog]);
    }

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
        'IcebergCatalog/reconnectMetadata',
      );
    } catch (metadataError) {
      console.error('Failed to load metadata after reconnection:', metadataError);
    }

    showSuccess({
      title: 'Reconnected',
      message: `Successfully reconnected to Iceberg catalog '${catalog.catalogAlias}'`,
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

    // Clean up secret on failure
    try {
      await pool.query(buildDropSecretQuery(catalog.secretName));
    } catch {
      // Ignore cleanup errors
    }

    updateIcebergCatalogConnectionState(catalog.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to Iceberg catalog '${catalog.catalogAlias}': ${errorMessage}`,
    });

    return false;
  }
}

/**
 * Disconnects an Iceberg catalog: detaches, drops secret, updates state, cleans metadata.
 */
export async function disconnectIcebergCatalog(
  pool: any,
  catalog: IcebergCatalog,
): Promise<void> {
  try {
    // DETACH the catalog
    const { toDuckDBIdentifier } = await import('@utils/duckdb/identifier');
    const detachQuery = `DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(catalog.catalogAlias)}`;
    await pool.query(detachQuery);

    // DROP SECRET
    await pool.query(buildDropSecretQuery(catalog.secretName));

    // Update connection state
    updateIcebergCatalogConnectionState(catalog.id, 'disconnected');

    // Remove metadata
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(catalog.catalogAlias);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'IcebergCatalog/disconnect');

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

      if (
        tab.type === 'schema-browser' &&
        tab.sourceType === 'db' &&
        tab.sourceId === catalog.id
      ) {
        tabsToClose.push(tabId);
      }
    }

    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    showSuccess({
      title: 'Disconnected',
      message: `Successfully disconnected from Iceberg catalog '${catalog.catalogAlias}'`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from Iceberg catalog '${catalog.catalogAlias}': ${errorMessage}`,
    });

    // Still update state to disconnected
    updateIcebergCatalogConnectionState(catalog.id, 'disconnected', errorMessage);
  }
}
