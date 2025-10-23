// Public sql script controller API's
// By convetion the order should follow CRUD groups!

import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import { SQL_SCRIPT_TABLE_NAME } from '@models/persisted-store';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { findUniqueName } from '@utils/helpers';
import { createPersistenceCatchHandler } from '@utils/persistence-logger';
import { ensureScript, makeSQLScriptId } from '@utils/sql-script';

import { persistDeleteSqlScript } from './persist';
import { deleteSqlScriptImpl } from './pure';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const createSQLScript = (name: string = 'query', content: string = ''): SQLScript => {
  const { sqlScripts } = useAppStore.getState();
  const allNames = new Set(Array.from(sqlScripts.values()).map((script) => script.name));

  const fileName = findUniqueName(name, (value) => allNames.has(value));
  const sqlScriptId = makeSQLScriptId();
  const sqlScript: SQLScript = {
    id: sqlScriptId,
    name: fileName,
    content,
  };

  // Add the new SQL script to the store
  useAppStore.setState(
    (state) => ({
      sqlScripts: new Map(state.sqlScripts).set(sqlScriptId, sqlScript),
    }),
    undefined,
    'AppStore/createSQLScript',
  );

  // Persist the new SQL script to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, sqlScript, sqlScriptId).catch(
      createPersistenceCatchHandler('persist new SQL script')
    );
  }

  return sqlScript;
};

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

export const updateSQLScriptContent = (
  sqlScriptOrId: SQLScript | SQLScriptId,
  newContent: string,
): void => {
  const { sqlScripts } = useAppStore.getState();

  // Check if the script exists
  const sqlScript = ensureScript(sqlScriptOrId, sqlScripts);

  // Create updated script
  const updatedScript: SQLScript = {
    ...sqlScript,
    content: newContent,
  };

  // Update the store
  const newSqlScripts = new Map(sqlScripts);
  newSqlScripts.set(sqlScript.id, updatedScript);

  // Update the store with changes
  useAppStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/updateSQLScriptContent',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id).catch(
      createPersistenceCatchHandler('persist SQL script content update')
    );
  }
};

export const renameSQLScript = (sqlScriptOrId: SQLScript | SQLScriptId, newName: string): void => {
  const { sqlScripts } = useAppStore.getState();

  // Check if the script exists
  const sqlScript = ensureScript(sqlScriptOrId, sqlScripts);

  // Make sure the name is unique among other scripts
  const allNames = new Set(
    Array.from(sqlScripts.values())
      .filter((script) => script.id !== sqlScript.id)
      .map((script) => script.name),
  );

  const uniqueName = findUniqueName(newName, (value) => allNames.has(value));

  // Create updated script
  const updatedScript: SQLScript = {
    ...sqlScript,
    name: uniqueName,
  };

  // Update the store
  const newSqlScripts = new Map(sqlScripts);
  newSqlScripts.set(sqlScript.id, updatedScript);

  // Update the store with changes
  useAppStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/renameSQLScript',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id).catch(
      createPersistenceCatchHandler('persist SQL script rename')
    );
  }
};

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

/**
 * Deletes one or more SQL scripts from the store and persists the change.
 * This also deletes any tabs that are associated with the SQL scripts being deleted.
 *
 * @param sqlScriptIds - iterable of IDs of SQL scripts to delete
 */
export const deleteSqlScripts = (sqlScriptIds: Iterable<SQLScriptId>) => {
  const {
    sqlScripts,
    scriptAccessTimes,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const sqlScriptIdsToDeleteSet = new Set(sqlScriptIds);

  const newSqlScripts = deleteSqlScriptImpl(sqlScriptIds, sqlScripts);

  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'script') {
      if (sqlScriptIdsToDeleteSet.has(tab.sqlScriptId)) {
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

  // Create the updated state for access times (clean up orphaned entries)
  const newScriptAccessTimes = new Map(
    Array.from(scriptAccessTimes).filter(([id, _]) => !sqlScriptIdsToDeleteSet.has(id)),
  );

  useAppStore.setState(
    {
      sqlScripts: newSqlScripts,
      scriptAccessTimes: newScriptAccessTimes,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteSqlScript',
  );

  if (iDbConn) {
    // Delete SQL scripts from IndexedDB
    persistDeleteSqlScript(iDbConn, sqlScriptIds);

    // Delete associated tabs from IndexedDB if any
    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }
};
