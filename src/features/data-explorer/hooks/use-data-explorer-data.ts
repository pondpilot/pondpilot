import { Comparison } from '@models/comparison';
import {
  useAppStore,
  useFlatFileDataSourceMap,
  useLocalDBLocalEntriesMap,
  useLocalDBMetadata,
} from '@store/app-store';
import { useMemo } from 'react';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';

/**
 * Hook to gather all data needed for the data explorer
 */
export const useDataExplorerData = () => {
  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'data-source';
  });

  // Database-related data
  const localDBLocalEntriesMap = useLocalDBLocalEntriesMap();
  const databaseMetadata = useLocalDBMetadata();

  // File system related data
  const flatFileSources = useFlatFileDataSourceMap();
  const flatFileSourcesValues = useMemo(
    () => Array.from(flatFileSources.values()),
    [flatFileSources],
  );

  // All data sources for checking file views and separating databases
  const allDataSources = useAppStore((state) => state.dataSources);

  // Get all local entries (files and folders)
  const localEntriesValues = useAppStore((state) => state.localEntries);
  const allLocalEntries = useMemo(
    () => Array.from(localEntriesValues.values()),
    [localEntriesValues],
  );

  // Filter out files that are attached as databases (.duckdb files)
  const nonLocalDBFileEntries = useMemo(
    () => allLocalEntries.filter((entry) => !localDBLocalEntriesMap.has(entry.id)),
    [allLocalEntries, localDBLocalEntriesMap],
  );

  // Get all file view names from flat file sources for identification
  const fileViewNames = useMemo(() => {
    const viewNames = new Set(flatFileSourcesValues.map((source) => source.viewName));
    // console.log('[use-data-explorer-data] fileViewNames:', Array.from(viewNames));
    // console.log('[use-data-explorer-data] flatFileSourcesValues:', flatFileSourcesValues);
    return viewNames;
  }, [flatFileSourcesValues]);

  // Gather comparison metadata
  const comparisons = useAppStore((state) => state.comparisons);
  const comparisonValues = useMemo(
    () => Array.from(comparisons.values()) as Comparison[],
    [comparisons],
  );

  const comparisonTableNames = useMemo(
    () =>
      new Set(
        comparisonValues
          .map((comparison) => comparison.resultsTableName)
          .filter((name): name is string => Boolean(name)),
      ),
    [comparisonValues],
  );

  const comparisonByTableName = useMemo(() => {
    const map = new Map<string, Comparison>();
    for (const comparison of comparisonValues) {
      if (comparison.resultsTableName) {
        map.set(comparison.resultsTableName, comparison);
      }
    }
    return map;
  }, [comparisonValues]);

  // These are the node state maps that get passed as extra data to the explorer tree
  const nodeMap: DataExplorerNodeMap = new Map();
  const anyNodeIdToNodeTypeMap = new Map<string, keyof DataExplorerNodeTypeMap>();

  // Build initial expanded state
  const initialExpandedState: Record<string, boolean> = {};

  return {
    hasActiveElement,
    localDBLocalEntriesMap,
    databaseMetadata,
    flatFileSources,
    flatFileSourcesValues,
    allDataSources,
    localEntriesValues,
    allLocalEntries,
    nonLocalDBFileEntries,
    fileViewNames,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    initialExpandedState,
    comparisonTableNames,
    comparisonByTableName,
  };
};
