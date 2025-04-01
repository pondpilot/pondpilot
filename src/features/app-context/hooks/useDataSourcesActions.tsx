import { Remote } from 'comlink';
import { tableFromIPC } from 'apache-arrow';
import { useAppStore } from '@store/app-store';
import { useAppNotifications } from '@components/app-notifications';
import { AddDataSourceProps, DuckDBDatabase, DuckDBView } from '@models/common';
import {
  useAddFileHandlesMutation,
  useDeleteFileHandlesMutation,
  useDeleteTabsMutatuion,
  useFileHandlesQuery,
  useAllTabsQuery,
} from '@store/app-idb-store';
import { DBWorkerAPIType, DropFilesAndDBInstancesProps } from '../models';
import { updateDatabasesWithColumns } from '../utils';
import { useAppContext } from '../app-context';

export const useDataSourcesActions = () => {
  const { showError, showWarning } = useAppNotifications();
  const { dbProxyRef } = useAppContext();

  /**
   * Query state
   */
  const { data: dataSources = [] } = useFileHandlesQuery();
  const { data: tabs = [] } = useAllTabsQuery();

  /**
   * Mutations IDB
   */
  const { mutateAsync: deleteSources } = useDeleteFileHandlesMutation();
  const { mutateAsync: deleteTabs } = useDeleteTabsMutatuion();
  const { mutateAsync: addSource } = useAddFileHandlesMutation();

  /**
   * Store access
   */
  const setViews = useAppStore((state) => state.setViews);
  const setDatabases = useAppStore((state) => state.setDatabases);

  /**
   * Delete data source from the session
   */
  const onDeleteDataSource = async ({ ids, type }: DropFilesAndDBInstancesProps) => {
    if (!dbProxyRef.current) return;
    try {
      if (!dataSources.length) {
        throw new Error('Failed to get sources data');
      }
      const tabsToDelete = tabs.filter((tab) => ids.includes(tab.sourceId));
      if (tabsToDelete.length) {
        await deleteTabs(tabsToDelete.map((tab) => tab.id));
      }
      await dbProxyRef.current.dropFilesAndDBInstances({
        ids,
        type,
      });
      await deleteSources(ids);
      /**
       * Get views and databases from the database
       */
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
      const updatedViews = dbExternalViews.filter((view) =>
        dataSources?.some((source) => (view.comment || '').includes(source.id)),
      );
      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );
      setDatabases(transformedTables);
      setViews(updatedViews);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'Failed to delete sources', message });
      console.error('Failed to delete sources: ', e);
    }
  };

  /**
   * Add data sources to the session
   */
  const onAddDataSources = async (entries: AddDataSourceProps) => {
    try {
      /**
       * Error handling. Check if the user selected any data sources and if the proxy is initialized
       */
      if (entries.length === 0) return;
      if (!dbProxyRef.current) throw new Error('Proxy not initialized');
      const onlyNewEntries = entries.filter(({ entry }) => {
        const exists = dataSources.some((item) => item.name === entry.name);
        return !exists;
      });
      if (onlyNewEntries.length !== entries.length) {
        showWarning({
          title: 'Warning',
          message: 'Some files were not added because they already exist.',
        });
      }
      /**
       * Register file handle in the navigator
       */
      const updatedDataSources = await addSource(entries);

      await Promise.all(
        updatedDataSources.map((source) =>
          dbProxyRef.current?.registerFileHandleAndCreateDBInstance(source).catch((e) => {
            console.error('Failed to register file handle in the database', e, { source });
            deleteSources([source.id]);
          }),
        ),
      );
      // Get views and databases
      const dbExternalViews: DuckDBView[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON());

      const duckdbDatabases = tableFromIPC(await dbProxyRef.current.getDBUserInstances('databases'))
        .toArray()
        .map((row) => row.toJSON().database_name);

      const views = dbExternalViews
        .filter((view) =>
          updatedDataSources?.some((source) => (view.comment || '').includes(source.id)),
        )
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
      setDatabases(transformedTables);
      setViews(views);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'Failed to add data source', message });
      console.error(e);
    }
  };

  return {
    onAddDataSources,
    onDeleteDataSource,
  };
};
