// Public data source controller API's
// By convetion the order should follow CRUD groups!

import { useAppStore } from '@store/app-store';
import { PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { deleteTabImpl } from '@controllers/tab/pure';
import { persistDeleteTab } from '@controllers/tab/persist';
import { detachAndUnregisterDatabase, dropViewAndUnregisterFile } from '@controllers/db';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { persistDeleteDataSource } from './persist';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

/**
 * Deletes one or more data sources from the store and persists the change.
 * This also deletes any tabs that are associated with the data sources being deleted.
 *
 * @param dataSourceIds - array of IDs of data sources to delete
 */

export const deleteDataSources = (
  conn: AsyncDuckDBConnectionPool,
  dataSourceIds: PersistentDataSourceId[],
) => {
  const {
    dataSources,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    localEntries,
    dataViewCache,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  // Data source have many connected objects.
  // First, some tabs may be displaying data from sources (1+ tab to 1 data source).
  // Then, as of today, all data sources are coming from local files which also need to be deleted.
  const dataSourceIdsToDelete = new Set(dataSourceIds);

  // Save objects & entries (files) to be deleted - we'll need them later to delete from db
  const deletedDataSources = dataSourceIds
    .map((id) => dataSources.get(id))
    .filter((ds) => ds !== undefined);

  const deletedLocalEntries = deletedDataSources
    .map((ds) => localEntries.get(ds.fileSourceId))
    // This is really just for type safety, as we know that the localEntries map
    // will contain the entries for the data sources being deleted
    .filter((le) => le !== undefined);

  // Create the updated state for data sources
  const newDataSources = new Map(
    Array.from(dataSources).filter(([id, _]) => !dataSourceIdsToDelete.has(id)),
  );

  // Create the updated state for tabs
  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'data-source') {
      if (dataSourceIdsToDelete.has(tab.dataSourceId)) {
        tabsToDelete.push(tabId);
      }
    }
  }

  let newTabs = tabs;
  let newTabOrder = tabOrder;
  let newActiveTabId = activeTabId;
  let newPreviewTabId = previewTabId;
  let newDataViewCache = dataViewCache;

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl({
      deleteTabIds: tabsToDelete,
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
      dataViewCache,
    });

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
    newDataViewCache = result.newDataViewCache;
  }

  // Create the updated state for local entires
  const entryIdsToDelete = new Set(deletedLocalEntries.map((le) => le.id));
  const newLocalEntires = new Map(
    Array.from(localEntries).filter(([id, _]) => !entryIdsToDelete.has(id)),
  );

  useAppStore.setState(
    {
      dataSources: newDataSources,
      localEntries: newLocalEntires,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
      dataViewCache: newDataViewCache,
    },
    undefined,
    'AppStore/deleteDataSource',
  );

  if (iDbConn) {
    // Delete data sources from IndexedDB
    persistDeleteDataSource(iDbConn, dataSourceIds, entryIdsToDelete);

    // Delete associated tabs from IndexedDB if any. For simplicty we do not bother
    // doing this in a single transaction, highly unlikely to be a problem.
    // This also takes care of the data view cache entries associated with the tabs
    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }

  // Finally, delete the data sources from the database as well as stored metadata
  deletedDataSources.forEach((dataSource) => {
    if (dataSource.type === 'attached-db') {
      detachAndUnregisterDatabase(
        conn,
        dataSource.dbName,
        localEntries.get(dataSource.fileSourceId)?.uniqueAlias,
      );
    } else if (dataSource.type === 'xlsx-sheet') {
      throw new Error('TODO: implement xlsx-sheet data source deletion');
    } else {
      dropViewAndUnregisterFile(
        conn,
        dataSource.viewName,
        localEntries.get(dataSource.fileSourceId)?.uniqueAlias,
      );
    }
  });
};
