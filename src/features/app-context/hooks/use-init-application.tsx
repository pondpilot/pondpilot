import { showError, showWarning } from '@components/app-notifications';
import { loadDuckDBFunctions } from '@controllers/db/duckdb-functions-controller';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { useDatabaseConnectionPool, useDatabaseInitializer } from '@features/database-context';
import { PersistentDataSourceId } from '@models/data-source';
import { useAppStore, setAppLoadState } from '@store/app-store';
import { initializePersistence } from '@store/persistence-init';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { attachDatabaseWithRetry } from '@utils/connection-manager';
import { isRemoteDatabase } from '@utils/data-source';
import { updateRemoteDbConnectionState } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';
import { isMotherDuckUrl } from '@utils/url-helpers';
import { useEffect } from 'react';

import { useShowPermsAlert } from './use-show-perm-alert';

// Reconnect to remote databases after app initialization
async function reconnectRemoteDatabases(conn: ConnectionPool): Promise<void> {
  const { dataSources, _persistenceAdapter, _iDbConn } = useAppStore.getState();
  const connectedDatabases: string[] = [];
  const attachedDbNames = new Set<string>();

  // First, check which databases are already attached
  try {
    const checkConn = await conn.acquire();
    try {
      const result = await checkConn.execute('SELECT database_name FROM duckdb_databases');
      if (result && result.rows && result.rows.length > 0) {
        for (const row of result.rows) {
          if (row && row.database_name) {
            attachedDbNames.add(row.database_name.toString());
          }
        }
      }
    } finally {
      await conn.release(checkConn);
    }
  } catch (e) {
    console.warn('Failed to query existing databases:', e);
  }

  // Track MotherDuck databases grouped by instance
  const motherDuckInstancesMap = new Map<string, Array<{ id: string; dataSource: any }>>();

  for (const [id, dataSource] of dataSources) {
    if (isRemoteDatabase(dataSource) && isMotherDuckUrl(dataSource.url)) {
      const instanceId = dataSource.instanceId || 'default';
      if (!motherDuckInstancesMap.has(instanceId)) {
        motherDuckInstancesMap.set(instanceId, []);
      }
      motherDuckInstancesMap.get(instanceId)!.push({ id, dataSource });
    }
  }

  // If we have multiple MotherDuck instances, we have a problem - only one should be active
  if (motherDuckInstancesMap.size > 1) {
    console.warn(
      '[MotherDuck] Multiple MotherDuck instances found in persistence. This should not happen. Using the most recent one.',
    );
    // Find the most recent instance based on attachedAt timestamp
    let mostRecentInstance: string | undefined;
    let mostRecentTime = 0;
    for (const [instanceId, databases] of motherDuckInstancesMap) {
      for (const { dataSource } of databases) {
        if (dataSource.attachedAt && dataSource.attachedAt > mostRecentTime) {
          mostRecentTime = dataSource.attachedAt;
          mostRecentInstance = instanceId;
        }
      }
    }

    // Remove all other instances from persistence
    const { persistDeleteDataSource } = await import('@controllers/data-source/persist');
    const persistTarget = _persistenceAdapter || _iDbConn;
    if (persistTarget) {
      for (const [instanceId, databases] of motherDuckInstancesMap) {
        if (instanceId !== mostRecentInstance) {
          // Collect IDs to delete
          const idsToDelete = databases.map((d) => d.id as PersistentDataSourceId);
          if (idsToDelete.length > 0) {
            try {
              await persistDeleteDataSource(persistTarget, idsToDelete, []);
              // Also remove from current dataSources
              for (const { id } of databases) {
                dataSources.delete(id as PersistentDataSourceId);
              }
            } catch (e) {
              console.warn('[MotherDuck] Could not delete data sources from persistence:', e);
            }
          }
        }
      }
    }

    // Keep only the most recent instance
    const finalDatabases = mostRecentInstance ? motherDuckInstancesMap.get(mostRecentInstance) : [];
    motherDuckInstancesMap.clear();
    if (mostRecentInstance && finalDatabases) {
      motherDuckInstancesMap.set(mostRecentInstance, finalDatabases);
    }
  }

  // Now process the single MotherDuck instance
  const motherDuckEntries = Array.from(motherDuckInstancesMap.entries());
  if (motherDuckEntries.length > 0) {
    const [motherDuckInstanceId, motherDuckDatabases] = motherDuckEntries[0];
    try {
      const { SecretsAPI } = await import('../../../services/secrets-api');
      // Apply the secret to set MOTHERDUCK_TOKEN environment variable
      await SecretsAPI.applySecretToConnection({
        connection_id: `motherduck_reconnect_${motherDuckInstanceId}`,
        secret_id: motherDuckInstanceId,
      });

      const authConn = await conn.acquire();
      try {
        // Attach each MotherDuck database individually
        for (const { id, dataSource } of motherDuckDatabases) {
          try {
            updateRemoteDbConnectionState(id as any, 'connecting');

            const attachQuery = `ATTACH 'md:${dataSource.dbName}'`;
            await authConn.execute(attachQuery);

            updateRemoteDbConnectionState(id as any, 'connected');
            connectedDatabases.push(dataSource.dbName);
            attachedDbNames.add(dataSource.dbName);
          } catch (attachError: any) {
            const msg = String(attachError?.message || attachError);
            if (/already attached|already in use/i.test(msg)) {
              updateRemoteDbConnectionState(id as any, 'connected');
              connectedDatabases.push(dataSource.dbName);
              attachedDbNames.add(dataSource.dbName);
            } else {
              console.warn(`[MotherDuck] Failed to attach database ${dataSource.dbName}:`, msg);
              updateRemoteDbConnectionState(id as any, 'error', msg);
            }
          }
        }
      } catch (e) {
        // Ignore MotherDuck authentication errors
      } finally {
        await conn.release(authConn);
      }
    } catch (error) {
      console.error('[MotherDuck] Failed to authenticate with MotherDuck:', error);
    }
  }

  for (const [id, dataSource] of dataSources) {
    if (isRemoteDatabase(dataSource)) {
      try {
        updateRemoteDbConnectionState(id, 'connecting');

        // Check if this database is already attached
        if (attachedDbNames.has(dataSource.dbName)) {
          // For MotherDuck databases, check if it's the right instance
          if (isMotherDuckUrl(dataSource.url)) {
            // Verify it's actually accessible (the right instance)
            try {
              const testConn = await conn.acquire();
              try {
                const testQuery = `SELECT 1 FROM "${dataSource.dbName}".information_schema.tables LIMIT 1`;
                await testConn.execute(testQuery);
                // If we can query it, it's the right instance
                updateRemoteDbConnectionState(id, 'connected');
                connectedDatabases.push(dataSource.dbName);
                continue;
              } finally {
                await conn.release(testConn);
              }
            } catch (e) {
              // Can't access it, likely wrong instance - need to detach and reattach
              console.warn(
                `Database ${dataSource.dbName} is attached but not accessible, likely wrong instance`,
              );
              try {
                const detachConn = await conn.acquire();
                try {
                  const { toDuckDBIdentifier } = await import('@utils/duckdb/identifier');
                  await detachConn.execute(
                    `DETACH DATABASE ${toDuckDBIdentifier(dataSource.dbName)}`,
                  );
                  attachedDbNames.delete(dataSource.dbName);
                } finally {
                  await conn.release(detachConn);
                }
              } catch (detachError) {
                console.warn(
                  `Failed to detach inaccessible database ${dataSource.dbName}:`,
                  detachError,
                );
              }
            }
          } else {
            // Non-MotherDuck database already attached
            updateRemoteDbConnectionState(id, 'connected');
            connectedDatabases.push(dataSource.dbName);
            continue;
          }
        }

        // Skip MotherDuck databases here - they've been handled above
        if (isMotherDuckUrl(dataSource.url)) {
          // MotherDuck databases are handled separately after authentication
          continue;
        }

        // Prepare the attach query for non-MotherDuck databases
        let attachQuery: string = '';

        // First, re-attach the database for non-MotherDuck remote databases
        try {
          attachQuery = buildAttachQuery(dataSource.url, dataSource.dbName, { readOnly: true });

          await attachDatabaseWithRetry(conn, attachQuery, {
            maxRetries: 3,
            timeout: 30000,
            retryDelay: 2000,
            exponentialBackoff: true,
          });

          updateRemoteDbConnectionState(id, 'connected');
          connectedDatabases.push(dataSource.dbName);
          attachedDbNames.add(dataSource.dbName);
        } catch (attachError: any) {
          // If it's already attached or similar, treat as success
          const msg = String(attachError?.message || attachError);
          if (
            /already in use|already attached|Unique file handle conflict|already exists/i.test(msg)
          ) {
            updateRemoteDbConnectionState(id, 'connected');
            connectedDatabases.push(dataSource.dbName);
            attachedDbNames.add(dataSource.dbName);
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
        } else if (typeof error === 'object' && error !== null) {
          // Handle non-Error objects that might have a message property
          errorMessage = (error as any).message || JSON.stringify(error);
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

  const conn = useDatabaseConnectionPool();
  const connectDuckDb = useDatabaseInitializer();
  const appLoadState = useAppStore((state) => state.appLoadState);

  const initAppData = async (resolvedConn: ConnectionPool) => {
    // Init app db (state persistence)
    // TODO: handle errors, e.g. blocking on older version from other tab
    try {
      const { discardedEntries, warnings } = await initializePersistence(resolvedConn, (_) =>
        showPermsAlert(),
      );

      // Load DuckDB functions into the store
      await loadDuckDBFunctions(resolvedConn);

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

    // Only initialize if we haven't already (prevent re-initialization)
    if (appLoadState !== 'init') return;

    // Start initialization of data when the database is ready
    if (conn) {
      initAppData(conn);
    } else {
      connectDuckDb();
    }
  }, [conn, appLoadState, isFileAccessApiSupported, isMobileDevice, connectDuckDb]);
}
