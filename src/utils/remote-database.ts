/**
 * Remote Database Utilities
 *
 * Utilities for managing remote database connections and error handling
 */

import { showError, showWarning, showSuccess } from '@components/app-notifications';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { deleteTab } from '@controllers/tab';
import { RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { executeWithRetry } from '@utils/connection-manager';
import { buildAttachQuery, buildDetachQuery } from '@utils/sql-builder';

// Re-export validation functions from the separate module
export {
  ALLOWED_REMOTE_PROTOCOLS,
  validateRemoteDatabaseUrl,
  sanitizeRemoteDatabaseUrl,
  isRemoteDatabasePath,
  getRemoteDatabaseDisplayName,
} from './remote-database-validation';

/**
 * Updates the connection state of a remote database
 */
export function updateRemoteDbConnectionState(
  dbId: PersistentDataSourceId,
  state: RemoteDB['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(dbId);

  if (!dataSource || dataSource.type !== 'remote-db') {
    return;
  }

  const updatedDb: RemoteDB = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(dbId, updatedDb);
  useAppStore.setState({ dataSources: newDataSources }, false, 'RemoteDB/updateConnectionState');
}

/**
 * Attempts to reconnect a remote database
 */
export async function reconnectRemoteDatabase(pool: any, remoteDb: RemoteDB): Promise<boolean> {
  try {
    updateRemoteDbConnectionState(remoteDb.id, 'connecting');

    // First, re-attach the database with READ_ONLY flag
    const attachQuery = buildAttachQuery(remoteDb.url, remoteDb.dbName, { readOnly: true });

    try {
      await executeWithRetry(pool, attachQuery, {
        maxRetries: 3,
        timeout: 30000, // 30 seconds
        retryDelay: 2000, // 2 seconds
        exponentialBackoff: true,
      });
    } catch (attachError: any) {
      // Check for various "already attached" error messages
      const errorMsg = attachError.message || '';
      const isAlreadyAttached =
        errorMsg.includes('already in use') ||
        errorMsg.includes('already attached') ||
        errorMsg.includes('Unique file handle conflict');

      if (!isAlreadyAttached) {
        throw attachError;
      }
    }

    // Wait for the database to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify the database is attached by checking the catalog
    const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${remoteDb.dbName}'`;

    let dbFound = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!dbFound && attempts < maxAttempts) {
      try {
        const result = await pool.query(checkQuery);
        if (result && result.numRows > 0) {
          dbFound = true;
        } else {
          throw new Error('Database not found in catalog');
        }
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          throw new Error(
            `Database ${remoteDb.dbName} could not be verified after ${maxAttempts} attempts`,
          );
        }
        console.warn(`Attempt ${attempts}: Database not ready yet, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    updateRemoteDbConnectionState(remoteDb.id, 'connected');

    // Load metadata for the reconnected database
    try {
      // Load metadata for the reconnected database
      const remoteMetadata = await getDatabaseModel(pool, [remoteDb.dbName]);

      // Merge with existing metadata
      const currentMetadata = useAppStore.getState().databaseMetadata;
      const newMetadata = new Map(currentMetadata);

      for (const [dbName, dbModel] of remoteMetadata) {
        newMetadata.set(dbName, dbModel);
      }

      useAppStore.setState({ databaseMetadata: newMetadata }, false, 'RemoteDB/reconnectMetadata');
    } catch (metadataError) {
      console.error('Failed to load metadata after reconnection:', metadataError);
    }

    showSuccess({
      title: 'Reconnected',
      message: `Successfully reconnected to remote database '${remoteDb.dbName}'`,
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

    updateRemoteDbConnectionState(remoteDb.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to remote database '${remoteDb.dbName}': ${errorMessage}`,
    });

    return false;
  }
}

/**
 * Handles errors when accessing remote databases
 */
export function handleRemoteDatabaseError(dbId: PersistentDataSourceId, error: Error): void {
  const errorMessage = error.message || String(error);

  // Check for common network errors
  if (
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('ERR_NETWORK') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED')
  ) {
    updateRemoteDbConnectionState(dbId, 'disconnected', 'Network connection lost');

    showWarning({
      title: 'Connection Lost',
      message: 'Lost connection to remote database. Please check your internet connection.',
    });
  } else if (
    errorMessage.includes('403') ||
    errorMessage.includes('401') ||
    errorMessage.includes('AccessDenied')
  ) {
    updateRemoteDbConnectionState(dbId, 'error', 'Access denied');

    showError({
      title: 'Access Denied',
      message: 'You do not have permission to access this remote database.',
    });
  } else {
    updateRemoteDbConnectionState(dbId, 'error', errorMessage);

    showError({
      title: 'Database Error',
      message: `Error accessing remote database: ${errorMessage}`,
    });
  }
}

/**
 * Disconnects a remote database
 */
export async function disconnectRemoteDatabase(pool: any, remoteDb: RemoteDB): Promise<void> {
  try {
    // DETACH the database
    const detachQuery = buildDetachQuery(remoteDb.dbName, true);
    await pool.query(detachQuery);

    // Update connection state to disconnected
    updateRemoteDbConnectionState(remoteDb.id, 'disconnected');

    // Remove database metadata
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(remoteDb.dbName);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'RemoteDB/disconnect');

    // Close any open tabs related to this database
    const { tabs } = useAppStore.getState();
    const tabsToClose: TabId[] = [];

    for (const [tabId, tab] of tabs) {
      // Close data tabs that reference this database
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === remoteDb.id
      ) {
        tabsToClose.push(tabId);
      }

      // Close schema browser tabs that reference this database
      if (
        tab.type === 'schema-browser' &&
        tab.sourceType === 'db' &&
        tab.sourceId === remoteDb.id
      ) {
        tabsToClose.push(tabId);
      }
    }

    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    showSuccess({
      title: 'Disconnected',
      message: `Successfully disconnected from remote database '${remoteDb.dbName}'`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from remote database '${remoteDb.dbName}': ${errorMessage}`,
    });

    // Still update state to disconnected as the user intended to disconnect
    updateRemoteDbConnectionState(remoteDb.id, 'disconnected', errorMessage);
  }
}
