import { showError, showWarning } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  useDuckDBConnectionPool,
  useDuckDBInitializer,
} from '@features/duckdb-context/duckdb-context';
import { setAppLoadState } from '@store/app-store';
import { restoreAppDataFromIDB } from '@store/restore';
import { useEffect } from 'react';

import { useShowPermsAlert } from './use-show-perm-alert';

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
      // await loadDuckDBFunctions(resolvedConn);

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
          title: 'Warning',
          message: `A total of ${totalDiscarded} file handles were discarded. 
          ${totalErrors} couldn't be read, ${totalDenied} were denied by user, and 
          ${totalRemoved} were removed from disk.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error restoring app data:', message);
      showError({
        title: 'App Initialization Error',
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
