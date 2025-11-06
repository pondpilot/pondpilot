// Public comparison controller API's
// By convetion the order should follow CRUD groups!

import { showWarning } from '@components/app-notifications';
import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import { refreshDatabaseMetadata } from '@features/data-explorer/utils/metadata-refresh';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  Comparison,
  ComparisonId,
  ComparisonConfig,
  SchemaComparisonResult,
} from '@models/comparison';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { COMPARISON_TABLE_NAME, TAB_TABLE_NAME } from '@models/persisted-store';
import { ComparisonTab, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { setComparisonPartialResults } from '@store/comparison-metadata';
import { ensureComparison, makeComparisonId } from '@utils/comparison';
import { findUniqueName, getAllExistingNames } from '@utils/helpers';

import { persistDeleteComparison } from './persist';
import { deleteComparisonImpl } from './pure';
import { dropComparisonResultsTable } from './table-utils';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const createComparison = (
  name: string = 'Comparison',
  config: ComparisonConfig | null = null,
): Comparison => {
  const { comparisons, sqlScripts } = useAppStore.getState();

  // Generate unique name checking both comparisons and SQL scripts
  const allExistingNames = getAllExistingNames({ comparisons, sqlScripts });

  const uniqueName = findUniqueName(name, (value) => allExistingNames.has(value));
  const comparisonId = makeComparisonId();
  const comparison: Comparison = {
    id: comparisonId,
    name: uniqueName,
    config,
    schemaComparison: null,
    lastExecutionTime: null,
    lastRunAt: null,
    resultsTableName: null,
    metadata: {
      sourceStats: null,
      partialResults: false,
      executionMetadata: null,
    },
  };

  // Add the new comparison to the store
  useAppStore.setState(
    (state) => ({
      comparisons: new Map(state.comparisons).set(comparisonId, comparison),
    }),
    undefined,
    'AppStore/createComparison',
  );

  // Persist the new comparison to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, comparison, comparisonId);
  }

  return comparison;
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

export const updateComparisonConfig = (
  comparisonOrId: Comparison | ComparisonId,
  config: ComparisonConfig,
): void => {
  const { comparisons } = useAppStore.getState();

  // Check if the comparison exists
  const comparison = ensureComparison(comparisonOrId, comparisons);

  // Create updated comparison
  const updatedComparison: Comparison = {
    ...comparison,
    config,
  };

  // Update the store
  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  // Update the store with changes
  useAppStore.setState(
    {
      comparisons: newComparisons,
    },
    undefined,
    'AppStore/updateComparisonConfig',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, updatedComparison, comparison.id);
  }
};

export const clearComparisonResults = async (
  comparisonOrId: Comparison | ComparisonId,
  options?: { pool?: AsyncDuckDBConnectionPool | null; tableNameOverride?: string | null },
): Promise<void> => {
  const { comparisons, tabs, _iDbConn: iDbConn } = useAppStore.getState();
  const comparison = ensureComparison(comparisonOrId, comparisons);

  if (!comparison.resultsTableName && comparison.lastExecutionTime === null) {
    return;
  }

  const tableName = options?.tableNameOverride ?? comparison.resultsTableName;
  const pool = options?.pool ?? null;

  if (tableName && pool) {
    const dropOutcome = await dropComparisonResultsTable(pool, tableName);
    if (!dropOutcome.ok) {
      showWarning({
        title: 'Failed to clear comparison results',
        message: `Could not remove the stored results table "${tableName}". Please try again or refresh the database connection. Details: ${dropOutcome.error.message}`,
      });
      throw dropOutcome.error;
    }
  }

  const updatedComparison: Comparison = {
    ...comparison,
    resultsTableName: null,
    lastExecutionTime: null,
    lastRunAt: null,
  };

  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  const newTabs = new Map(tabs);
  const updatedTabIds: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'comparison' && tab.comparisonId === comparison.id) {
      const updatedTab: ComparisonTab = {
        ...tab,
        viewingResults: false,
        comparisonResultsTable: null,
        lastExecutionTime: null,
      };
      newTabs.set(tabId, updatedTab);
      updatedTabIds.push(tabId);
    }
  }

  useAppStore.setState(
    {
      comparisons: newComparisons,
      tabs: newTabs,
    },
    undefined,
    'AppStore/clearComparisonResults',
  );

  if (iDbConn) {
    const tx = iDbConn.transaction([COMPARISON_TABLE_NAME, TAB_TABLE_NAME], 'readwrite');
    await tx.objectStore(COMPARISON_TABLE_NAME).put(updatedComparison, comparison.id);
    const tabStore = tx.objectStore(TAB_TABLE_NAME);
    for (const tabId of updatedTabIds) {
      const tab = newTabs.get(tabId);
      if (tab) {
        await tabStore.put(tab, tabId);
      }
    }
    await tx.done;
  }

  setComparisonPartialResults(comparison.id, false);

  if (pool && tableName) {
    await refreshDatabaseMetadata(pool, [PERSISTENT_DB_NAME]);
  }
};

export const updateComparisonSchemaAnalysis = (
  comparisonOrId: Comparison | ComparisonId,
  schemaComparison: SchemaComparisonResult | null,
): void => {
  const { comparisons } = useAppStore.getState();

  // Check if the comparison exists
  const comparison = ensureComparison(comparisonOrId, comparisons);

  // Create updated comparison
  const updatedComparison: Comparison = {
    ...comparison,
    schemaComparison,
  };

  // Update the store
  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  // Update the store with changes
  useAppStore.setState(
    {
      comparisons: newComparisons,
    },
    undefined,
    'AppStore/updateComparisonSchemaAnalysis',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, updatedComparison, comparison.id);
  }
};

export const renameComparison = (
  comparisonOrId: Comparison | ComparisonId,
  newName: string,
): void => {
  const { comparisons, sqlScripts } = useAppStore.getState();

  // Check if the comparison exists
  const comparison = ensureComparison(comparisonOrId, comparisons);

  // Make sure the name is unique among both other comparisons and SQL scripts
  const allExistingNames = getAllExistingNames({
    comparisons,
    sqlScripts,
    excludeId: comparison.id,
  });

  const uniqueName = findUniqueName(newName, (value) => allExistingNames.has(value));

  // Create updated comparison
  const updatedComparison: Comparison = {
    ...comparison,
    name: uniqueName,
  };

  // Update the store
  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  // Update the store with changes
  useAppStore.setState(
    {
      comparisons: newComparisons,
    },
    undefined,
    'AppStore/renameComparison',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, updatedComparison, comparison.id);
  }
};

export const updateComparisonExecutionTime = (
  comparisonOrId: Comparison | ComparisonId,
  timestamp: number,
): void => {
  const { comparisons } = useAppStore.getState();

  // Check if the comparison exists
  const comparison = ensureComparison(comparisonOrId, comparisons);

  // Create updated comparison
  const updatedComparison: Comparison = {
    ...comparison,
    lastExecutionTime: timestamp,
    lastRunAt: new Date().toISOString(),
  };

  // Update the store
  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  // Update the store with changes
  useAppStore.setState(
    {
      comparisons: newComparisons,
    },
    undefined,
    'AppStore/updateComparisonExecutionTime',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, updatedComparison, comparison.id);
  }
};

export const updateComparisonResultsTable = (
  comparisonOrId: Comparison | ComparisonId,
  resultsTableName: string | null,
): void => {
  const { comparisons } = useAppStore.getState();

  // Check if the comparison exists
  const comparison = ensureComparison(comparisonOrId, comparisons);

  // Create updated comparison
  const updatedComparison: Comparison = {
    ...comparison,
    resultsTableName,
  };

  // Update the store
  const newComparisons = new Map(comparisons);
  newComparisons.set(comparison.id, updatedComparison);

  // Update the store with changes
  useAppStore.setState(
    {
      comparisons: newComparisons,
    },
    undefined,
    'AppStore/updateComparisonResultsTable',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(COMPARISON_TABLE_NAME, updatedComparison, comparison.id);
  }
};

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

/**
 * Deletes one or more comparisons from the store and persists the change.
 * This also deletes any tabs that are associated with the comparisons being deleted,
 * and cleans up the associated results tables from the database.
 *
 * @param comparisonIds - iterable of IDs of comparisons to delete
 * @param pool - Optional DuckDB connection pool for cleaning up results tables
 */
export const deleteComparisons = async (
  comparisonIds: Iterable<ComparisonId>,
  pool?: any, // AsyncDuckDBConnectionPool - optional to avoid circular dependency
) => {
  const {
    comparisons,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const comparisonIdsToDeleteSet = new Set(comparisonIds);

  // Collect table names to clean up
  const tablesToDrop: string[] = [];
  for (const comparisonId of comparisonIdsToDeleteSet) {
    const comparison = comparisons.get(comparisonId);
    if (comparison?.resultsTableName) {
      tablesToDrop.push(comparison.resultsTableName);
    }
  }

  const newComparisons = deleteComparisonImpl(comparisonIds, comparisons);

  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'comparison') {
      if (comparisonIdsToDeleteSet.has(tab.comparisonId)) {
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

  useAppStore.setState(
    {
      comparisons: newComparisons,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteComparison',
  );

  // Clean up results tables from the database
  if (pool) {
    if (tablesToDrop.length > 0) {
      for (const tableName of tablesToDrop) {
        const outcome = await dropComparisonResultsTable(pool, tableName);
        if (!outcome.ok) {
          console.error(`Failed to drop comparison results table ${tableName}:`, outcome.error);
        }
      }
    }

    await refreshDatabaseMetadata(pool, [PERSISTENT_DB_NAME]);
  }

  if (iDbConn) {
    // Delete comparisons from IndexedDB
    await persistDeleteComparison(iDbConn, comparisonIds);

    // Delete associated tabs from IndexedDB if any
    if (tabsToDelete.length) {
      await persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }
};
