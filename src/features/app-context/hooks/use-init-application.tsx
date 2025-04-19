import { useEffect } from 'react';
import { showWarning } from '@components/app-notifications';
import { setAppLoadState } from '@store/app-store';
import { restoreAppDataFromIDB } from '@store/restore';
import {
  useDuckDBConnectionPool,
  useDuckDBInitializer,
} from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { useShowPermsAlert } from './use-show-perm-alert';

export function useAppInitialization(isFileAccessApiSupported: boolean) {
  const { showPermsAlert } = useShowPermsAlert();

  const conn = useDuckDBConnectionPool();
  const connectDuckDb = useDuckDBInitializer();

  const initAppData = async (resolvedConn: AsyncDuckDBConnectionPool) => {
    // Init app db (state persistence)
    // TODO: handle errors, e.g. blocking on older version from other tab
    const { discardedEntries, warnings } = await restoreAppDataFromIDB(resolvedConn, (_) =>
      showPermsAlert(),
    );

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

    // Report we are ready
    setAppLoadState('ready');
  };

  useEffect(() => {
    // As of today, if the File Access API is not supported,
    // we are not initializing either in-memory DuckDB or the app data.
    if (!isFileAccessApiSupported) return;

    // Start initialization of data when the database is ready
    if (conn) {
      initAppData(conn);
    } else {
      connectDuckDb();
    }
  }, [conn]);
}
