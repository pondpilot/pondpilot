import { useEffect, useRef } from 'react';
import { releaseProxy, Remote, wrap } from 'comlink';
import { tableFromIPC } from 'apache-arrow';
import { useAppStore } from '@store/app-store';
import { useAppNotifications } from '@components/app-notifications';
import { fileHandleStoreApi, useDeleteFileHandlesMutation } from '@store/app-idb-store';
import { DuckDBDatabase, DuckDBView } from '@models/common';
import { setAppLoadState } from '@store/init-store';
import { hydrateAppData } from '@store/persist/init';
import { DBWorkerAPIType } from '../models';
import { useShowPermsAlert } from './useShowPermsAlert';
import { updateDatabasesWithColumns } from '../utils';

export function useAppInitialization() {
  const { showError, showWarning } = useAppNotifications();
  const { showPermsAlert } = useShowPermsAlert();
  const dbWorkerRef = useRef<Worker | null>(null);
  const dbProxyRef = useRef<Remote<DBWorkerAPIType> | null>(null);

  const setViews = useAppStore((state) => state.setViews);
  const setDatabases = useAppStore((state) => state.setDatabases);

  const { mutateAsync: deleteSources } = useDeleteFileHandlesMutation();

  useEffect(() => {
    const controller = new AbortController();

    const initAppData = async () => {
      setAppLoadState('init');

      // Create and initialize worker
      const dbWorker = new Worker(new URL('../db-worker.ts', import.meta.url), {
        name: 'DBWorker',
        type: 'module',
      });
      const dbProxy = wrap<DBWorkerAPIType>(dbWorker);
      dbWorkerRef.current = dbWorker;
      dbProxyRef.current = dbProxy;

      if (controller.signal.aborted) return;

      // Initialize DB
      await dbProxyRef.current
        .initDB()
        .catch((e) => showError({ title: 'Failed to initialize database', message: e.message }));

      // Get list of files in the session
      const sessionFiles = await fileHandleStoreApi.getFileHandles().catch((e) => {
        showError({ title: 'Failed to get session files', message: e.message });
        return null;
      });

      // Check permissions and process files
      if (sessionFiles) {
        const statuses = await Promise.all(
          sessionFiles.map(async (source) => {
            const status = (await source.handle.queryPermission()) === 'granted';
            return status;
          }),
        );

        if (statuses.includes(false)) {
          const userResponse = await showPermsAlert();
          if (!userResponse) {
            return;
          }
          await Promise.all(
            sessionFiles.map(async (source) => {
              await source.handle.requestPermission({ mode: 'read' });
            }),
          );
        }

        // Check file availability
        const checkedFiles = await Promise.all(
          sessionFiles.map(async (source) => {
            try {
              await source.handle.getFile();
              return {
                status: 'success',
                source,
              };
            } catch (e) {
              return {
                status: 'error',
                source,
              };
            }
          }),
        );

        const availableFiles = checkedFiles.filter((file) => file.status === 'success');
        const unavailableFiles = checkedFiles.filter((file) => file.status === 'error');

        if (unavailableFiles.length) {
          await deleteSources(unavailableFiles.map((file) => file.source.id));
          showWarning({
            title: 'Warning',
            message:
              'Some views/files were removed from the session memory because it is not possible to read them.',
          });
        }

        // Register available files
        await Promise.all(
          sessionFiles
            .filter((source) =>
              availableFiles.some(
                (file) => file.source.path === source.path && file.status === 'success',
              ),
            )
            .map(async (source) =>
              dbProxy.registerFileHandleAndCreateDBInstance(source).catch((e) => {
                deleteSources([source.id]);
                showError({
                  title: 'Error registering file handle in the database',
                  message: e.message,
                });
              }),
            ),
        ).catch((e) => {
          console.error(e);
          showError({ title: 'Failed to register file handle', message: e.message });
        });
      }

      // Get views and databases
      const dbExternalViews: DuckDBView[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON());

      const duckdbDatabases: string[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('databases').catch((e) => {
          showError({ title: 'Failed to get databases', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => (row.toJSON() as DuckDBDatabase).database_name);

      const initViews = dbExternalViews
        .filter((view) => sessionFiles?.some((source) => (view.comment || '').includes(source.id)))
        .map((view) => {
          const { sourceId } = JSON.parse(view.comment || '{}');
          return {
            ...view,
            sourceId,
          };
        });

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      // Init app db (state persistence)
      // TODO: handle errors, e.g. blocking on older version from other tab
      const discardedHandles = await hydrateAppData((_) => showPermsAlert());

      // TODO: more detailed/better message
      if (discardedHandles.length) {
        const { totalErrors, totalDenied, totalRemoved } = discardedHandles.reduce(
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

        const totalDiscarded = totalErrors + totalDenied + totalRemoved;

        showWarning({
          title: 'Warning',
          message: `A total of ${totalDiscarded} file handles were discarded. 
          ${totalErrors} couldn't be read, ${totalDenied} were denied by user, and 
          ${totalRemoved} were removed from disk.`,
        });
      }

      // Set the initial state
      setViews(initViews);
      setDatabases(transformedTables);
      setAppLoadState('ready');
    };

    controller.signal.addEventListener('abort', () => {
      dbProxyRef.current?.[releaseProxy]();
      dbProxyRef.current = null;
      dbWorkerRef.current?.terminate();
      dbWorkerRef.current = null;
    });

    initAppData();

    return () => {
      controller.abort();
    };
  }, []);

  return { dbProxyRef };
}
