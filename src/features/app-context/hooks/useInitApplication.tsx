import { useEffect } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { setAppLoadState } from '@store/app-store';
import { restoreAppDataFromIDB } from '@store/restore';
import { useDuckDBConnection, useDuckDBInitializer } from '@features/duckdb-context/duckdb-context';
import { useShowPermsAlert } from './useShowPermsAlert';

export function useAppInitialization() {
  const { showWarning } = useAppNotifications();
  const { showPermsAlert } = useShowPermsAlert();

  const { db, conn } = useDuckDBConnection();
  const connectDuckDb = useDuckDBInitializer();

  const initAppData = async () => {
    if (!db || !conn) {
      throw new Error('DuckDB connection is not ready');
    }
    // Init app db (state persistence)
    // TODO: handle errors, e.g. blocking on older version from other tab
    const { discardedEntries, warnings } = await restoreAppDataFromIDB(db, conn, (_) =>
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
    // Start initialization of data when the database is ready
    if (conn) {
      initAppData();
    } else {
      connectDuckDb();
    }
  }, [conn]);
}
