// Public data source controller API's
// By convetion the order should follow CRUD groups!

import {
  detachAndUnregisterDatabase,
  dropViewAndUnregisterFile,
  getDatabaseModel,
} from '@controllers/db';
import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId } from '@models/data-source';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { TabId } from '@models/tab';
import type { SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { getDatabaseIdentifier, isDatabaseDataSource } from '@utils/data-source';
import { buildDropGSheetHttpSecretQuery, buildGSheetHttpSecretName } from '@utils/gsheet-auth';
import { parseTableAccessKey } from '@utils/table-access';

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

export const deleteDataSources = async (
  conn: AsyncDuckDBConnectionPool,
  dataSourceIds: PersistentDataSourceId[],
) => {
  const {
    dataSources,
    dataSourceAccessTimes,
    tableAccessTimes,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    localEntries,
    registeredFiles,
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
    .map((ds) => ('fileSourceId' in ds ? localEntries.get(ds.fileSourceId) : undefined))
    // This is really just for type safety, as we know that the localEntries map
    // will contain the entries for the data sources being deleted
    .filter((le) => le !== undefined);

  // Create the updated state for data sources
  const newDataSources = new Map(
    Array.from(dataSources).filter(([id, _]) => !dataSourceIdsToDelete.has(id)),
  );

  const gsheetSecretsToCleanup = new Map<SecretId, string>();
  for (const dataSource of deletedDataSources) {
    if (dataSource.type !== 'gsheet-sheet' || !dataSource.secretRef) {
      continue;
    }

    const isStillReferenced = Array.from(newDataSources.values()).some(
      (remaining) =>
        remaining.type === 'gsheet-sheet' && remaining.secretRef === dataSource.secretRef,
    );
    if (!isStillReferenced) {
      gsheetSecretsToCleanup.set(
        dataSource.secretRef,
        buildGSheetHttpSecretName(dataSource.fileSourceId),
      );
    }
  }

  const newDataSourceAccessTimes = new Map(
    Array.from(dataSourceAccessTimes).filter(([id]) => !dataSourceIdsToDelete.has(id)),
  );

  const deletedDbNames = new Set(
    deletedDataSources
      .filter(isDatabaseDataSource)
      .map((dataSource) => getDatabaseIdentifier(dataSource)),
  );
  const newTableAccessTimes = new Map(
    Array.from(tableAccessTimes).filter(([key]) => {
      const parsed = parseTableAccessKey(key);
      if (!parsed) {
        return true;
      }
      const [dbName] = parsed;
      return !deletedDbNames.has(dbName);
    }),
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

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl({
      deleteTabIds: tabsToDelete,
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    });

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
  }

  // Create the updated state for local entires
  const entryIdsToDelete = new Set(deletedLocalEntries.map((le) => le.id));
  const newLocalEntires = new Map(
    Array.from(localEntries).filter(([id, _]) => !entryIdsToDelete.has(id)),
  );
  const newRegisteredFiles = new Map(
    Array.from(registeredFiles).filter(([id, _]) => !entryIdsToDelete.has(id)),
  );

  // Update the store with the new state
  useAppStore.setState(
    {
      dataSources: newDataSources,
      dataSourceAccessTimes: newDataSourceAccessTimes,
      tableAccessTimes: newTableAccessTimes,
      localEntries: newLocalEntires,
      registeredFiles: newRegisteredFiles,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
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

  // Delete the data sources from the database
  for (const dataSource of deletedDataSources) {
    if (dataSource.type === 'iceberg-catalog') {
      // For Iceberg catalogs: detach, drop DuckDB secret, and remove encrypted secret
      try {
        detachAndUnregisterDatabase(conn, dataSource.catalogAlias, dataSource.warehouseName);
      } catch (detachError) {
        console.warn('Failed to detach Iceberg catalog during deletion:', detachError);
      }
      try {
        const { buildDropSecretQuery } = await import('@utils/iceberg-sql-builder');
        await conn.query(buildDropSecretQuery(dataSource.secretName));
      } catch (secretError) {
        console.warn('Failed to drop Iceberg secret during deletion:', secretError);
      }
      if (dataSource.secretRef) {
        try {
          const { _iDbConn } = useAppStore.getState();
          if (_iDbConn) {
            const { deleteSecret } = await import('@services/secret-store');
            await deleteSecret(_iDbConn, dataSource.secretRef);
          }
        } catch (storeError) {
          console.warn('Failed to delete secret from store during deletion:', storeError);
        }
      }
      continue;
    }

    if (dataSource.type === 'remote-db') {
      // For remote databases, just detach
      detachAndUnregisterDatabase(conn, dataSource.dbName, dataSource.url);
      continue;
    }

    if (!('fileSourceId' in dataSource)) {
      continue;
    }

    const file = localEntries.get(dataSource.fileSourceId);
    if (!file || file.kind !== 'file' || file.fileType !== 'data-source') {
      if ('viewName' in dataSource) {
        await dropViewAndUnregisterFile(conn, dataSource.viewName, undefined);
      }
      continue;
    }
    if (dataSource.type === 'attached-db') {
      detachAndUnregisterDatabase(conn, dataSource.dbName, `${file.uniqueAlias}.${file.ext}`);
    } else if ('viewName' in dataSource) {
      // Wait for the view to be dropped to get fresh views metadata after that
      await dropViewAndUnregisterFile(conn, dataSource.viewName, `${file.uniqueAlias}.${file.ext}`);
    }
  }

  if (gsheetSecretsToCleanup.size > 0) {
    for (const duckdbSecretName of gsheetSecretsToCleanup.values()) {
      try {
        await conn.query(buildDropGSheetHttpSecretQuery(duckdbSecretName));
      } catch (error) {
        console.warn('Failed to drop Google Sheets HTTP secret during deletion:', error);
      }
    }
    if (iDbConn) {
      for (const secretRef of gsheetSecretsToCleanup.keys()) {
        try {
          const { deleteSecret } = await import('@services/secret-store');
          await deleteSecret(iDbConn, secretRef);
        } catch (error) {
          console.warn('Failed to delete Google Sheets token from secret store:', error);
        }
      }
    }
  }

  // After database is updated (views are dropped), create the updated state for database metadata
  const { databaseMetadata } = useAppStore.getState();
  const deletedDataBases = new Set(
    deletedDataSources.filter(isDatabaseDataSource).map((ds) => getDatabaseIdentifier(ds)),
  );
  // Filter out deleted databases from the metadata
  // eslint-disable-next-line prefer-const
  let newDatabaseMetadata = new Map(
    Array.from(databaseMetadata).filter(([dbName, _]) => !deletedDataBases.has(dbName)),
  );
  // Update metadata views
  if (deletedDataSources.some((ds) => !isDatabaseDataSource(ds))) {
    // Refresh metadata for pondpilot database
    const newViewsMetadata = await getDatabaseModel(conn, [PERSISTENT_DB_NAME], ['main']);

    // Update pondpilot database metadata
    if (newViewsMetadata.has(PERSISTENT_DB_NAME)) {
      newDatabaseMetadata.set(PERSISTENT_DB_NAME, newViewsMetadata.get(PERSISTENT_DB_NAME)!);
    } else {
      // Ensure pondpilot always has metadata even if empty
      newDatabaseMetadata.set(PERSISTENT_DB_NAME, {
        name: PERSISTENT_DB_NAME,
        schemas: [
          {
            name: 'main',
            objects: [],
          },
        ],
      });
    }
  }
  // Set metadata state
  useAppStore.setState(
    {
      databaseMetadata: newDatabaseMetadata,
    },
    undefined,
    'AppStore/deleteDataSource',
  );
};
