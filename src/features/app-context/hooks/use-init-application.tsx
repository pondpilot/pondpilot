import { showError, showWarning } from '@components/app-notifications';
import { installCorsProxyMacros } from '@controllers/db/cors-proxy-macros-controller';
import { loadDuckDBFunctions } from '@controllers/db/duckdb-functions-controller';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  useDuckDBConnectionPool,
  useDuckDBInitializer,
} from '@features/duckdb-context/duckdb-context';
import { useAppStore, setAppLoadState } from '@store/app-store';
import { restoreAppDataFromIDB } from '@store/restore';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { attachDatabaseWithRetry } from '@utils/connection-manager';
import { isRemoteDatabase } from '@utils/data-source';
import { updateRemoteDbConnectionState } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';
import { useEffect } from 'react';

import { useShowPermsAlert } from './use-show-perm-alert';

// Reconnect to remote databases after app initialization
async function reconnectRemoteDatabases(conn: AsyncDuckDBConnectionPool): Promise<void> {
  const { dataSources } = useAppStore.getState();
  const connectedDatabases: string[] = [];

  for (const [id, dataSource] of dataSources) {
    if (isRemoteDatabase(dataSource)) {
      try {
        updateRemoteDbConnectionState(id, 'connecting');

        // First, re-attach the database with READ_ONLY flag for remote databases
        try {
          const attachQuery = buildAttachQuery(dataSource.url, dataSource.dbName, {
            readOnly: true,
          });

          // Use connection manager with retries and timeout
          await attachDatabaseWithRetry(conn, attachQuery, {
            maxRetries: 3,
            timeout: 30000, // 30 seconds
            retryDelay: 2000, // 2 seconds
            exponentialBackoff: true,
          });

          // Re-attached remote database
          updateRemoteDbConnectionState(id, 'connected');
          connectedDatabases.push(dataSource.dbName);
        } catch (attachError: any) {
          // If it's already attached, that's fine
          if (attachError.message?.includes('already in use')) {
            // Verify the existing connection
            await conn.query('SELECT 1');
            updateRemoteDbConnectionState(id, 'connected');
            connectedDatabases.push(dataSource.dbName);
          } else {
            throw attachError;
          }
        }
      } catch (error) {
        let errorMessage: string;

        if (error instanceof MaxRetriesExceededError) {
          errorMessage = `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }

        console.warn(`Failed to reconnect to remote database ${dataSource.dbName}:`, errorMessage);
        updateRemoteDbConnectionState(id, 'error', errorMessage);
      }
    }
  }

  // Load metadata for successfully connected remote databases
  if (connectedDatabases.length > 0) {
    try {
      // Load metadata for remote databases
      const remoteMetadata = await getDatabaseModel(conn, connectedDatabases);

      // Merge with existing metadata
      const currentMetadata = useAppStore.getState().databaseMetadata;
      const newMetadata = new Map(currentMetadata);

      for (const [dbName, dbModel] of remoteMetadata) {
        newMetadata.set(dbName, dbModel);
      }

      useAppStore.setState({ databaseMetadata: newMetadata }, false, 'RemoteDB/loadMetadata');
    } catch (error) {
      console.error('Failed to load metadata for remote databases:', error);
    }
  }
}

interface UseAppInitializationProps {
  isFileAccessApiSupported: boolean;
  isMobileDevice: boolean;
}

export function useAppInitialization({
  isFileAccessApiSupported,
  isMobileDevice,
}: UseAppInitializationProps) {
  const { showPermsAlert } = useShowPermsAlert();

  const conn = useDuckDBConnectionPool();
  const connectDuckDb = useDuckDBInitializer();

  const initAppData = async (resolvedConn: AsyncDuckDBConnectionPool) => {
    // Init app db (state persistence)
    // TODO: handle errors, e.g. blocking on older version from other tab
    try {
      const { discardedEntries, warnings } = await restoreAppDataFromIDB(resolvedConn, (_) =>
        showPermsAlert(),
      );

      // Load DuckDB functions into the store
      await loadDuckDBFunctions(resolvedConn);

      // Install CORS proxy macros
      try {
        await installCorsProxyMacros(resolvedConn);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Failed to install CORS proxy macros:', message);
        showWarning({
          title: 'CORS Proxy Initialization Warning',
          message:
            'CORS proxy macros could not be installed. Remote databases may require manual configuration.',
        });
      }

      // Reconnect to remote databases
      await reconnectRemoteDatabases(resolvedConn);

      // TODO: more detailed/better message
      if (discardedEntries.length) {
        const { totalErrors, totalDenied, totalRemoved } = discardedEntries.reduce(
          (acc, entry) => {
            const what = entry.entry.kind === 'file' ? 'File' : 'Directory';
            switch (entry.type) {
              case 'removed':
                console.warn(`${what} '${entry.entry.name}' was removed from disk.`);
                acc.totalRemoved += 1;
                break;
              case 'error':
                console.error(
                  `${what} '${entry.entry.name}' handle couldn't be read: ${entry.reason}.`,
                );
                acc.totalErrors += 1;
                break;
              case 'denied':
              default:
                console.warn(`${what} '${entry.entry.name}' handle permission was denied by user.`);
                acc.totalDenied += 1;
                break;
            }
            return acc;
          },
          { totalErrors: 0, totalDenied: 0, totalRemoved: 0 },
        );

        // Show warnings if any
        if (warnings.length) {
          showWarning({
            title: 'Initialization Warnings',
            message: warnings.map((w) => w).join('\n'),
          });
        }

        const totalDiscarded = totalErrors + totalDenied + totalRemoved;

        showWarning({
          title: 'Some files unavailable',
          message: `A total of ${totalDiscarded} file handles were discarded.
          ${totalErrors} couldn't be read, ${totalDenied} were denied by user, and
          ${totalRemoved} were removed from disk.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error restoring app data:', message);
      showError({
        title: 'Cannot restore app data',
        message: `Failed to restore app data. ${message}`,
      });
    }

    // Report we are ready
    setAppLoadState('ready');
  };

  useEffect(() => {
    // As of today, if the File Access API is not supported,
    // we are not initializing either in-memory DuckDB or the app data.
    if (!isFileAccessApiSupported || isMobileDevice) return;

    // Start initialization of data when the database is ready
    if (conn) {
      initAppData(conn);
    } else {
      connectDuckDb();
    }
  }, [conn]);
}
