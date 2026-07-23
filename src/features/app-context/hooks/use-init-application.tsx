import { showError, showWarning } from '@components/app-notifications';
import { installCorsProxyMacros } from '@controllers/db/cors-proxy-macros-controller';
import { loadDuckDBFunctions } from '@controllers/db/duckdb-functions-controller';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { refreshDatabaseMetadata } from '@features/data-explorer/utils/metadata-refresh';
import {
  useDuckDBConnectionPool,
  useDuckDBInitializer,
} from '@features/duckdb-context/duckdb-context';
import type { GSheetSheetView } from '@models/data-source';
import { AnyDataSource } from '@models/data-source';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { useAppStore, setAppLoadState } from '@store/app-store';
import {
  CoreAppDataSnapshot,
  restoreAppDataFromIDB,
  restoreCoreAppDataFromIDB,
} from '@store/restore';
import { MaxRetriesExceededError } from '@utils/connection-errors';
import { attachDatabaseWithRetry } from '@utils/connection-manager';
import {
  isRemoteDatabase,
  isIcebergCatalog,
  isDuckLakeCatalog,
  isLocalDatabase,
  isMotherDuckConnection,
  isQuackConnection,
} from '@utils/data-source';
import {
  attachAndVerifyDuckLakeCatalog,
  updateDuckLakeConnectionState,
} from '@utils/ducklake-catalog';
import { notifyGSheetTokenExpired } from '@utils/gsheet-reauth';
import {
  attachAndVerifyIcebergCatalog,
  resolveIcebergCredentials,
  updateIcebergCatalogConnectionState,
} from '@utils/iceberg-catalog';
import {
  resolveMotherDuckToken,
  reconnectMotherDuck,
  updateMotherDuckConnectionState,
} from '@utils/motherduck';
import {
  resolveQuackToken,
  reconnectQuackConnection,
  updateQuackConnectionState,
} from '@utils/quack';
import { updateRemoteDbConnectionState } from '@utils/remote-database';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { buildAttachQuery } from '@utils/sql-builder';
import { useEffect, useRef } from 'react';

import { useShowPermsAlert } from './use-show-perm-alert';

// Reconnect to remote databases after app initialization
async function reconnectRemoteDatabases(conn: AsyncDuckDBConnectionPool): Promise<void> {
  const { dataSources, _iDbConn } = useAppStore.getState();
  const connectedDatabases: string[] = [];

  // MotherDuck must initialize before Quack when both are restored on startup.
  // The current DuckDB-WASM/MotherDuck extension can fail with
  // "InMemory not implemented yet" if Quack has already been loaded in the
  // same engine instance. Preserve normal insertion order otherwise.
  const getReconnectPriority = (dataSource: AnyDataSource): number => {
    if (isMotherDuckConnection(dataSource)) return 0;
    if (isQuackConnection(dataSource)) return 2;
    return 1;
  };
  const orderedDataSources = Array.from(dataSources).sort(
    ([, left], [, right]) => getReconnectPriority(left) - getReconnectPriority(right),
  );

  for (const [id, dataSource] of orderedDataSources) {
    if (isIcebergCatalog(dataSource)) {
      // Resolve credentials from secret store (or inline fallback)
      const credentials = _iDbConn ? await resolveIcebergCredentials(_iDbConn, dataSource) : null;

      if (!credentials) {
        updateIcebergCatalogConnectionState(id, 'credentials-required');
        continue;
      }

      try {
        updateIcebergCatalogConnectionState(id, 'connecting');

        // Use shared attach-and-verify utility. Skip the settle delay
        // during startup reconnection — catalogs attach synchronously.
        await attachAndVerifyIcebergCatalog({
          pool: conn,
          secretName: dataSource.secretName,
          catalogAlias: dataSource.catalogAlias,
          warehouseName: dataSource.warehouseName,
          credentials,
          endpoint: dataSource.endpoint,
          endpointType: dataSource.endpointType,
          useCorsProxy: dataSource.useCorsProxy,
          settleDelayMs: 0,
          maxVerifyAttempts: 3,
        });

        updateIcebergCatalogConnectionState(id, 'connected');
        connectedDatabases.push(dataSource.catalogAlias);
      } catch (error) {
        let errorMessage: string;
        if (error instanceof MaxRetriesExceededError) {
          errorMessage = `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }

        const sanitized = sanitizeErrorMessage(errorMessage);
        console.warn(`Failed to reconnect iceberg catalog ${dataSource.catalogAlias}:`, sanitized);
        updateIcebergCatalogConnectionState(id, 'error', sanitized);
      }
      continue;
    }

    if (isDuckLakeCatalog(dataSource)) {
      try {
        updateDuckLakeConnectionState(id, 'connecting');

        await attachAndVerifyDuckLakeCatalog({
          pool: conn,
          url: dataSource.url,
          catalogAlias: dataSource.catalogAlias,
          readOnly: dataSource.readOnly ?? true,
          useCorsProxy: dataSource.useCorsProxy ?? false,
          settleDelayMs: 0,
          maxVerifyAttempts: 3,
        });

        updateDuckLakeConnectionState(id, 'connected');
        connectedDatabases.push(dataSource.catalogAlias);
      } catch (error) {
        let errorMessage: string;

        if (error instanceof MaxRetriesExceededError) {
          errorMessage = `Connection timeout after ${error.attempts} attempts: ${error.lastError.message}`;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }

        const sanitized = sanitizeErrorMessage(errorMessage);
        console.warn(`Failed to reconnect DuckLake catalog ${dataSource.catalogAlias}:`, sanitized);
        updateDuckLakeConnectionState(id, 'error', sanitized);
      }
      continue;
    }

    if (isQuackConnection(dataSource)) {
      const token = _iDbConn ? await resolveQuackToken(_iDbConn, dataSource) : null;

      if (!token) {
        updateQuackConnectionState(id, 'credentials-required');
        continue;
      }

      try {
        await reconnectQuackConnection(conn, dataSource, token);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitized = sanitizeErrorMessage(errorMessage);
        console.warn(`Failed to reconnect Quack database ${dataSource.dbName}:`, sanitized);
        updateQuackConnectionState(id, 'error', sanitized);
      }
      continue;
    }

    if (isMotherDuckConnection(dataSource)) {
      // Resolve token from the encrypted secret store
      const token = _iDbConn ? await resolveMotherDuckToken(_iDbConn, dataSource) : null;

      if (!token) {
        updateMotherDuckConnectionState(id, 'credentials-required');
        continue;
      }

      try {
        // reconnectMotherDuck handles metadata loading internally
        await reconnectMotherDuck(conn, dataSource, token);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitized = sanitizeErrorMessage(errorMessage);
        console.warn('Failed to reconnect to MotherDuck:', sanitized);
        updateMotherDuckConnectionState(id, 'error', sanitized);
      }
      continue;
    }

    if (isRemoteDatabase(dataSource)) {
      try {
        updateRemoteDbConnectionState(id, 'connecting');

        // First, re-attach the database with READ_ONLY flag for remote databases
        try {
          const attachQuery = buildAttachQuery(dataSource.url, dataSource.dbName, {
            readOnly: true,
            useCorsProxy: dataSource.useCorsProxy ?? true, // Default to true for backwards compatibility
            s3Endpoint: dataSource.s3Endpoint,
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

        const sanitized = sanitizeErrorMessage(errorMessage);
        console.warn(`Failed to reconnect to remote database ${dataSource.dbName}:`, sanitized);
        updateRemoteDbConnectionState(id, 'error', sanitized);
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
  isTabBlocked: boolean;
}

export function useAppInitialization({
  isFileAccessApiSupported,
  isMobileDevice,
  isTabBlocked,
}: UseAppInitializationProps) {
  const { showPermsAlert } = useShowPermsAlert();

  const conn = useDuckDBConnectionPool();
  const connectDuckDb = useDuckDBInitializer();
  const dataSources = useAppStore((state) => state.dataSources);
  const initializationRunRef = useRef<Promise<void> | null>(null);
  const initializationGenerationRef = useRef(0);
  const notifiedGSheetExpiriesRef = useRef(new Set<string>());

  const initAppData = async (
    resolvedConn: AsyncDuckDBConnectionPool,
    coreSnapshot: CoreAppDataSnapshot,
    generation: number,
  ) => {
    // Install CORS proxy macros before restoring persisted application data.
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

    // Init app db (state persistence)
    // TODO: handle errors, e.g. blocking on older version from other tab
    try {
      const { discardedEntries, warnings } = await restoreAppDataFromIDB(
        resolvedConn,
        (_) => showPermsAlert(),
        coreSnapshot,
      );

      if (generation !== initializationGenerationRef.current) return;

      // Report we're ready for user interactions now.
      setAppLoadState('ready');

      (async () => {
        // Local sources are ready for queries as soon as restore completes.
        // Hydrate their full table/column metadata in the background so it does
        // not delay the app's ready state. Remote metadata remains owned by the
        // reconnect flow below.
        const localDatabaseNames = Array.from(useAppStore.getState().dataSources.values())
          .filter(isLocalDatabase)
          .map((dataSource) => dataSource.dbName);
        void refreshDatabaseMetadata(resolvedConn, [...new Set(localDatabaseNames)]);

        try {
          // Load DuckDB functions into the store
          await loadDuckDBFunctions(resolvedConn);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('Failed to load DuckDB functions:', message);
          showWarning({
            title: 'DuckDB Functions Initialization Warning',
            message:
              'DuckDB function metadata could not be loaded. Some editor help and validation may be incomplete.',
          });
        }

        // Reconnect to remote databases
        try {
          await reconnectRemoteDatabases(resolvedConn);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('Failed to reconnect remote databases:', message);
          showWarning({
            title: 'Remote Database Reconnect Warning',
            message:
              'Some remote databases could not be reconnected at startup. They can be retried from the data explorer.',
          });
        }
      })().catch((error) => {
        console.error('Unexpected error during background app initialization:', error);
      });

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
      if (generation !== initializationGenerationRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error restoring app data:', message);
      showError({
        title: 'Cannot restore app data',
        message: `Failed to restore app data. ${message}`,
      });
      setAppLoadState('error');
    }
  };

  useEffect(() => {
    if (!conn) return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkExpiries = () => {
      const now = Date.now();
      let nextExpiry = Number.POSITIVE_INFINITY;
      const checkedGroups = new Set<string>();

      for (const ds of dataSources.values()) {
        if (ds.type !== 'gsheet-sheet' || ds.accessMode !== 'oauth' || !ds.tokenExpiresAt) {
          continue;
        }

        const groupKey = String(ds.fileSourceId);
        if (checkedGroups.has(groupKey)) continue;
        checkedGroups.add(groupKey);

        if (ds.tokenExpiresAt <= now) {
          const notificationKey = `${groupKey}:${ds.tokenExpiresAt}`;
          if (!notifiedGSheetExpiriesRef.current.has(notificationKey)) {
            notifiedGSheetExpiriesRef.current.add(notificationKey);
            notifyGSheetTokenExpired(conn, ds as GSheetSheetView);
          }
        } else {
          nextExpiry = Math.min(nextExpiry, ds.tokenExpiresAt);
        }
      }

      if (Number.isFinite(nextExpiry)) {
        const delay = Math.min(Math.max(nextExpiry - now + 100, 100), 2_147_483_647);
        timer = setTimeout(checkExpiries, delay);
      }
    };

    checkExpiries();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [conn, dataSources]);

  useEffect(() => {
    // Don't initialize DuckDB if this tab is blocked by another active tab
    if (isTabBlocked) {
      initializationGenerationRef.current += 1;
      initializationRunRef.current = null;
      setAppLoadState('init');
      return;
    }

    // As of today, if the File Access API is not supported,
    // we are not initializing either in-memory DuckDB or the app data.
    if (!isFileAccessApiSupported || isMobileDevice) return;

    if (useAppStore.getState().appLoadState === 'ready' || initializationRunRef.current) {
      return;
    }

    const generation = ++initializationGenerationRef.current;
    setAppLoadState('init');

    const initializationRun = (async () => {
      // Start the independent IDB read and DuckDB boot together. Core hydration
      // publishes scripts first; the full restore waits for both dependencies.
      const coreRestorePromise = restoreCoreAppDataFromIDB();
      const connectionPromise = conn ? Promise.resolve(conn) : connectDuckDb();

      try {
        const coreSnapshot = await coreRestorePromise;
        if (generation !== initializationGenerationRef.current) return;
        setAppLoadState('core-ready');

        const resolvedConn = await connectionPromise;
        if (generation !== initializationGenerationRef.current) return;
        if (!resolvedConn) {
          setAppLoadState('error');
          showError({
            title: 'Cannot initialize database',
            message: 'DuckDB failed to initialize. Reload the app to try again.',
          });
          return;
        }

        await initAppData(resolvedConn, coreSnapshot, generation);
      } catch (error) {
        if (generation !== initializationGenerationRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error initializing app data:', message);
        showError({
          title: 'Cannot initialize app data',
          message: `Failed to initialize app data. ${message}`,
        });
        setAppLoadState('error');
      }
    })();

    initializationRunRef.current = initializationRun;
    initializationRun.finally(() => {
      if (initializationRunRef.current === initializationRun) {
        initializationRunRef.current = null;
      }
    });
    // initAppData intentionally belongs to this initialization generation. Adding
    // its render-local identity would restart an in-flight boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, connectDuckDb, isFileAccessApiSupported, isMobileDevice, isTabBlocked]);
}
