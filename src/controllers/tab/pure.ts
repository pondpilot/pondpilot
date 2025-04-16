// This module contains the pure, shared functions implementing
// tab controller logic.
// By convetion the order should follow CRUD groups!

import { AnyFlatFileDataSource, AttachedDB } from '@models/data-source';
import { DataViewCacheItem, DataViewCacheKey } from '@models/data-view';
import { SQLScriptId } from '@models/sql-script';
import { AnyTab, AttachedDBDataTab, FlatFileDataSourceTab, ScriptTab, TabId } from '@models/tab';

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

export const findTabFromAttachedDBObjectImpl = (
  tabs: Map<TabId, AnyTab>,
  dataSource: AttachedDB,
  schemaName: string,
  objectName: string,
): AttachedDBDataTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'data-source' && tab.dataSourceType === 'db')
    .find(
      (tab) =>
        tab.dataSourceId === dataSource.id &&
        tab.schemaName === schemaName &&
        tab.objectName === objectName,
    );

export const findTabFromFlatFileDataSourceImpl = (
  tabs: Map<TabId, AnyTab>,
  dataSource: AnyFlatFileDataSource,
): FlatFileDataSourceTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'data-source' && tab.dataSourceType === 'file')
    .find((tab) => tab.dataSourceId === dataSource.id);

export const findTabFromScriptImpl = (
  tabs: Map<TabId, AnyTab>,
  sqlScriptId: SQLScriptId,
): ScriptTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'script')
    .find((tab) => tab.sqlScriptId === sqlScriptId);

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
 * The pure function implementing tab deletion logic. Use a shared helper
 * everywhere where you want to combine tab deletion logic with state
 * manipulation.
 *
 * This function handles the deletion of tabs, including updating the active tab
 * and preview tab IDs if necessary.
 *
 * @param deleteTabIds - Array of IDs of tabs to delete
 * @param tabs - Current tabs map
 * @param tabOrder - Current tab order array
 * @param activeTabId - Current active tab ID
 * @param previewTabId - Current preview tab ID
 * @param dataViewCache - Current data view cache map
 */
export const deleteTabImpl = ({
  deleteTabIds,
  tabs,
  tabOrder,
  activeTabId,
  previewTabId,
  dataViewCache,
}: {
  deleteTabIds: TabId[];
  tabs: Map<TabId, AnyTab>;
  tabOrder: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
  dataViewCache: Map<DataViewCacheKey, DataViewCacheItem>;
}): {
  newTabs: Map<TabId, AnyTab>;
  newTabOrder: TabId[];
  newActiveTabId: TabId | null;
  newPreviewTabId: TabId | null;
  newDataViewCache: Map<DataViewCacheKey, DataViewCacheItem>;
} => {
  const deleteSet = new Set(deleteTabIds);

  const newTabs = new Map(Array.from(tabs).filter(([id, _]) => !deleteSet.has(id)));
  const newTabOrder = tabOrder.filter((id) => !deleteSet.has(id));

  let newActiveTabId = activeTabId;
  if (activeTabId !== null && deleteSet.has(activeTabId)) {
    // Find the index of the first tab being deleted in the original order
    const firstDeletedIndex = Math.min(
      ...deleteTabIds
        .map((id) => tabOrder.findIndex((tabId) => tabId === id))
        .filter((idx) => idx !== -1),
    );

    // Try to activate the tab before the first deleted tab
    const prevTabIndex = firstDeletedIndex - 1;
    newActiveTabId = prevTabIndex >= 0 ? tabOrder[prevTabIndex] : null;

    // If we couldn't find a previous tab, try the first remaining tab
    if (newActiveTabId === null && newTabOrder.length > 0) {
      const [firstTab] = newTabOrder;
      newActiveTabId = firstTab;
    }
  }

  // Handle preview tab deletion
  const newPreviewTabId =
    previewTabId !== null && deleteSet.has(previewTabId) ? null : previewTabId;

  // Also remove data-view cache for the deleted tabs
  const newDataViewCache = new Map(
    Array.from(dataViewCache).filter(([key, _]) => !deleteSet.has(key)),
  );

  return {
    newTabs,
    newTabOrder,
    newActiveTabId,
    newPreviewTabId,
    newDataViewCache,
  };
};
