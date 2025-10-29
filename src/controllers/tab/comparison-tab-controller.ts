import { TAB_TABLE_NAME } from '@models/persisted-store';
import { ComparisonTab, ComparisonConfig, SchemaComparisonResult, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { makeTabId } from '@utils/tab';

import { persistCreateTab } from './persist';

/**
 * Creates a new comparison tab.
 *
 * @param options - Configuration options for the comparison tab
 * @param options.setActive - Whether to set the tab as active
 * @returns A comparison tab
 */
export const createComparisonTab = (options?: { setActive?: boolean }): ComparisonTab => {
  const { setActive = true } = options || {};

  const tabId = makeTabId();
  let tab: ComparisonTab;
  let newTabOrder: TabId[];
  let newActiveTabId: TabId | null;

  useAppStore.setState(
    (prev) => {
      // Generate a unique name for this comparison (check against both comparisons and scripts)
      const existingComparisonNames = Array.from(prev.tabs.values())
        .filter((t): t is ComparisonTab => t.type === 'comparison')
        .map((t) => t.name);
      const existingScriptNames = Array.from(prev.sqlScripts.values()).map((s) => s.name);
      const allExistingNames = new Set([...existingComparisonNames, ...existingScriptNames]);

      let comparisonNumber = 1;
      let name = `Comparison ${comparisonNumber}`;
      while (allExistingNames.has(name)) {
        comparisonNumber += 1;
        name = `Comparison ${comparisonNumber}`;
      }

      tab = {
        type: 'comparison',
        id: tabId,
        name,
        config: null,
        schemaComparison: null,
        viewingResults: false,
        lastExecutionTime: null,
        dataViewStateCache: null,
      };

      const newTabs = new Map(prev.tabs).set(tabId, tab);
      newTabOrder = [...prev.tabOrder, tabId];
      newActiveTabId = setActive ? tabId : prev.activeTabId;

      return {
        activeTabId: newActiveTabId,
        tabs: newTabs,
        tabOrder: newTabOrder,
      };
    },
    undefined,
    'AppStore/createComparisonTab',
  );

  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    try {
      persistCreateTab(iDb, tab!, newTabOrder!, newActiveTabId!);
    } catch (error) {
      console.error('Failed to persist comparison tab:', error);
    }
  }

  return tab!;
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
 * Updates the comparison configuration
 */
export const updateComparisonConfig = (tabId: TabId, config: Partial<ComparisonConfig>): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  // If config is null, create a new one with defaults
  const baseConfig: ComparisonConfig = tab.config || {
    sourceA: null,
    sourceB: null,
    joinColumns: [],
    columnMappings: {},
    filterMode: 'common',
    commonFilter: null,
    filterA: null,
    filterB: null,
    compareColumns: null,
    showOnlyDifferences: true,
    compareMode: 'strict',
  };

  const updatedTab: ComparisonTab = {
    ...tab,
    config: { ...baseConfig, ...config },
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/updateComparisonConfig');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Sets the full comparison configuration
 */
export const setComparisonConfig = (tabId: TabId, config: ComparisonConfig): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const updatedTab: ComparisonTab = {
    ...tab,
    config,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setComparisonConfig');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Updates the schema comparison result
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

  const updatedTab: ComparisonTab = {
    ...tab,
    schemaComparison,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/updateSchemaComparison');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Renames a comparison tab
 */
export const renameComparisonTab = (tabId: TabId, newName: string): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const updatedTab: ComparisonTab = {
    ...tab,
    name: newName,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/renameComparisonTab');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};

/**
 * Marks comparison as executed
 */
export const setComparisonExecutionTime = (tabId: TabId, timestamp: number): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'comparison') {
    return;
  }

  const updatedTab: ComparisonTab = {
    ...tab,
    lastExecutionTime: timestamp,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setComparisonExecutionTime');

  // Persist the changes to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};
