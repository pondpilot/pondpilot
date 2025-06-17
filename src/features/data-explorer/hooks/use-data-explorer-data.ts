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
  const fileViewNames = useMemo(
    () => new Set(flatFileSourcesValues.map((source) => source.viewName)),
    [flatFileSourcesValues],
  );

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
  };
};
