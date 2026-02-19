// Public data source controller API's
// By convetion the order should follow CRUD groups!

import {
  detachAndUnregisterDatabase,
  dropViewAndUnregisterFile,
  getDatabaseModel,
} from '@controllers/db';
import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import { PersistentDataSourceId } from '@models/data-source';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { TabId } from '@models/tab';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import type { SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { getDatabaseIdentifier, isDatabaseDataSource, isMotherDuckDbKey } from '@utils/data-source';
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
    databaseMetadata,
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

  const deletedDbIdentifiers = new Set(
    deletedDataSources
      .filter(isDatabaseDataSource)
      .map((dataSource) => getDatabaseIdentifier(dataSource)),
  );
  const shouldClearMotherDuckMetadata = deletedDataSources.some(
    (dataSource) => dataSource.type === 'motherduck',
  );
  if (shouldClearMotherDuckMetadata) {
    for (const dbName of databaseMetadata.keys()) {
      if (isMotherDuckDbKey(dbName)) {
        deletedDbIdentifiers.add(dbName);
      }
    }
  }
  const newTableAccessTimes = new Map(
    Array.from(tableAccessTimes).filter(([key]) => {
      const parsed = parseTableAccessKey(key);
      if (!parsed) {
        return true;
      }
      const [dbName] = parsed;
      return !deletedDbIdentifiers.has(dbName);
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

  // Explorer actions are fire-and-forget and have historically removed their nodes synchronously.
  // Keep that interaction contract while retaining fail-fast DuckDB cleanup: unexpected cleanup
  // failures restore the complete pre-delete application state below.
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

  try {
    // XLSX sheets have separate views but share one registered workbook. Unregister it only after
    // the first view is dropped; later sheets have no independent file registration to clean up.
    const unregisteredFileIds = new Set<string>();

    // Delete the data sources from the database
    for (const dataSource of deletedDataSources) {
      if (dataSource.type === 'iceberg-catalog') {
        // For Iceberg catalogs: detach, drop DuckDB secret, and remove encrypted secret
        await detachAndUnregisterDatabase(conn, dataSource.catalogAlias, dataSource.warehouseName);
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

      if (dataSource.type === 'motherduck') {
        // For MotherDuck connections: disconnect and remove encrypted secret
        try {
          const { detachMotherDuckDatabases } = await import('@utils/motherduck');
          await detachMotherDuckDatabases(conn);
        } catch (disconnectError) {
          console.warn('Failed to disconnect MotherDuck during deletion:', disconnectError);
        }
        if (dataSource.secretRef) {
          try {
            const { _iDbConn } = useAppStore.getState();
            if (_iDbConn) {
              const { deleteSecret } = await import('@services/secret-store');
              await deleteSecret(_iDbConn, dataSource.secretRef);
            }
          } catch (storeError) {
            console.warn(
              'Failed to delete MotherDuck secret from store during deletion:',
              storeError,
            );
          }
        }
        continue;
      }

      if (dataSource.type === 'remote-db') {
        // For remote databases, just detach
        await detachAndUnregisterDatabase(conn, dataSource.dbName, dataSource.url);
        continue;
      }

      if (dataSource.type === 'quack') {
        await detachAndUnregisterDatabase(conn, dataSource.dbName, dataSource.uri);
        if (dataSource.secretRef) {
          try {
            const { _iDbConn } = useAppStore.getState();
            if (_iDbConn) {
              const { deleteSecret } = await import('@services/secret-store');
              await deleteSecret(_iDbConn, dataSource.secretRef);
            }
          } catch (storeError) {
            console.warn('Failed to delete Quack secret from store during deletion:', storeError);
          }
        }
        continue;
      }

      if (dataSource.type === 'ducklake-catalog') {
        // For DuckLake catalogs, just detach
        await detachAndUnregisterDatabase(conn, dataSource.catalogAlias, dataSource.url);
        continue;
      }

      if (!('fileSourceId' in dataSource)) {
        continue;
      }

      const file = localEntries.get(dataSource.fileSourceId);
      if (!file || file.kind !== 'file' || file.fileType !== 'data-source') {
        continue;
      }
      if (dataSource.type === 'attached-db') {
        await detachAndUnregisterDatabase(
          conn,
          dataSource.dbName,
          `${file.uniqueAlias}.${file.ext}`,
        );
      } else if ('viewName' in dataSource) {
        // Wait for the view to be dropped to get fresh views metadata after that.
        const fileName = unregisteredFileIds.has(file.id)
          ? undefined
          : `${file.uniqueAlias}.${file.ext}`;
        await dropViewAndUnregisterFile(conn, dataSource.viewName, fileName);
        unregisteredFileIds.add(file.id);
      }
    }
  } catch (error) {
    useAppStore.setState(
      {
        dataSources,
        dataSourceAccessTimes,
        tableAccessTimes,
        localEntries,
        registeredFiles,
        tabs,
        tabOrder,
        activeTabId,
        previewTabId,
      },
      undefined,
      'AppStore/deleteDataSourceRollback',
    );
    throw error;
  }

  if (iDbConn) {
    persistDeleteDataSource(iDbConn, dataSourceIds, entryIdsToDelete);

    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
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
  // Filter out deleted databases from the metadata
  // eslint-disable-next-line prefer-const
  let newDatabaseMetadata = new Map(
    Array.from(databaseMetadata).filter(([dbName, _]) => !deletedDbIdentifiers.has(dbName)),
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
