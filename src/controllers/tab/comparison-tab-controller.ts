import {
  createComparison,
  updateComparisonConfig as updateComparisonConfigInternal,
  updateComparisonSchemaAnalysis,
  updateComparisonExecutionTime as updateComparisonExecutionTimeInternal,
  updateComparisonResultsTable as updateComparisonResultsTableInternal,
  renameComparison,
} from '@controllers/comparison';
import {
  Comparison,
  ComparisonId,
  ComparisonConfig,
  SchemaComparisonResult,
} from '@models/comparison';
import { TAB_TABLE_NAME } from '@models/persisted-store';
import { ComparisonTab, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { ensureComparison } from '@utils/comparison';
import { makeTabId } from '@utils/tab';

import { persistCreateTab } from './persist';
import { setActiveTabId } from './tab-controller';

/**
 * Updates the schema comparison result via tab ID
 * This is a wrapper for backward compatibility that gets the comparison from the tab
 */
export const updateSchemaComparison = (
  tabId: TabId,
  schemaComparison: SchemaComparisonResult | null,
): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const comparison = state.comparisons.get(tab.comparisonId);
  if (!comparison) {
    return;
  }

  updateComparisonSchemaAnalysis(comparison.id, schemaComparison);
};

/**
 * Updates the comparison configuration
 * This is a wrapper for backward compatibility that gets the comparison from the tab
 */
export const updateComparisonConfig = (tabId: TabId, config: Partial<ComparisonConfig>): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const comparison = state.comparisons.get(tab.comparisonId);
  if (!comparison) {
    return;
  }

  // Get the base config
  const baseConfig: ComparisonConfig = comparison.config || {
    sourceA: null,
    sourceB: null,
    joinColumns: [],
    joinKeyMappings: {},
    columnMappings: {},
    filterMode: 'common',
    commonFilter: null,
    filterA: null,
    filterB: null,
    showOnlyDifferences: true,
    compareMode: 'strict',
  };

  // Update the comparison in the store
  updateComparisonConfigInternal(comparison.id, { ...baseConfig, ...config });
};

/**
 * Renames a comparison via its tab ID
 * This is a wrapper for backward compatibility
 */
export const renameComparisonTab = (tabId: TabId, newName: string): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const comparison = state.comparisons.get(tab.comparisonId);
  if (!comparison) {
    return;
  }

  renameComparison(comparison.id, newName);
};

/**
 * Gets existing or creates a new tab from an existing comparison.
 * If the comparison is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param comparisonOrId - The ID or a Comparison object to create a tab from.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A ComparisonTab object.
 * @throws An error if the Comparison with the given ID does not exist.
 */
export const getOrCreateTabFromComparison = (
  comparisonOrId: Comparison | ComparisonId,
  setActive: boolean = false,
): ComparisonTab => {
  const state = useAppStore.getState();

  // Get the comparison object
  const comparison = ensureComparison(comparisonOrId, state.comparisons);

  // Check if the comparison already has an associated tab
  const existingTab = findTabFromComparison(comparison.id);

  // No need to create a new tab if one already exists
  if (existingTab) {
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  // Create a new tab
  const tabId = makeTabId();
  const tab: ComparisonTab = {
    type: 'comparison',
    id: tabId,
    comparisonId: comparison.id,
    viewingResults: Boolean(comparison.resultsTableName),
    lastExecutionTime: comparison.lastExecutionTime,
    comparisonResultsTable: comparison.resultsTableName,
    dataViewStateCache: null,
  };

  // Add the new tab to the store
  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];
  const newActiveTabId = setActive ? tabId : state.activeTabId;

  useAppStore.setState(
    {
      activeTabId: newActiveTabId,
      tabs: newTabs,
      tabOrder: newTabOrder,
    },
    undefined,
    'AppStore/createTabFromComparison',
  );

  // Persist the new tab to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};

/**
 * Finds a tab displaying an existing comparison or undefined.
 *
 * @param comparisonOrId - The ID or a Comparison object to find the tab for.
 * @returns A ComparisonTab object if found.
 * @throws An error if the Comparison with the given ID does not exist.
 */
export const findTabFromComparison = (
  comparisonOrId: Comparison | ComparisonId,
): ComparisonTab | undefined => {
  const state = useAppStore.getState();

  // Get the comparison object
  const comparison = ensureComparison(comparisonOrId, state.comparisons);

  // Check if a tab exists for this comparison
  for (const tab of state.tabs.values()) {
    if (tab.type === 'comparison' && tab.comparisonId === comparison.id) {
      return tab;
    }
  }

  return undefined;
};

/**
 * Creates a new comparison and opens it in a new tab.
 *
 * @param options - Configuration options
 * @param options.setActive - Whether to set the tab as active
 * @returns A comparison tab
 */
export const createComparisonTab = (options?: { setActive?: boolean }): ComparisonTab => {
  const { setActive = true } = options || {};

  // Create the comparison first
  const comparison = createComparison();

  // Then create and return a tab for it
  return getOrCreateTabFromComparison(comparison, setActive);
};

/**
 * Sets whether the comparison tab is viewing results or configuration
 */
export const setComparisonViewingResults = (tabId: TabId, viewingResults: boolean): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const updatedTab: ComparisonTab = {
    ...tab,
    viewingResults,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setComparisonViewingResults');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Marks comparison as executed
 * This wrapper updates both the tab (for UI state) and the comparison (for persistence)
 */
export const setComparisonExecutionTime = (tabId: TabId, timestamp: number): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  // Update the comparison object (persisted)
  updateComparisonExecutionTimeInternal(tab.comparisonId, timestamp);

  // Update the tab (UI state)
  const updatedTab: ComparisonTab = {
    ...tab,
    lastExecutionTime: timestamp,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setComparisonExecutionTime');

  // Persist the tab changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Sets the comparison results table name (materialized comparison results)
 * This wrapper updates both the tab (for UI state) and the comparison (for persistence)
 * The table name is now persisted because we use regular tables in the system database
 */
export const setComparisonResultsTable = (
  tabId: TabId,
  comparisonResultsTable: string | null,
): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  // Update the comparison object (persisted)
  updateComparisonResultsTableInternal(tab.comparisonId, comparisonResultsTable);

  // Update the tab (UI state)
  const updatedTab: ComparisonTab = {
    ...tab,
    comparisonResultsTable,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setComparisonResultsTable');

  // Persist the tab changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};
