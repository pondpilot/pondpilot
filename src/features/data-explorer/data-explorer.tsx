import { useExplorerContext } from '@components/explorer-tree/hooks';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { supportedFlatFileDataSourceFileExt } from '@models/file-system';
import { memo, useMemo } from 'react';

import { DataExplorerFilters, DataExplorerContent } from './components';
import { useFileSystemTreeBuilder } from './components/file-system-tree-builder';
import {
  useFilterNodes,
  useDatabaseSeparation,
  useBuildNodes,
  useDataExplorerState,
  useDataExplorerData,
  useDataExplorerActions,
} from './hooks';
import { DataExplorerContext, DataExplorerNodeTypeMap } from './model';

/**
 * Unified data explorer that combines file system and database exploration
 */
export const DataExplorer = memo(() => {
  const conn = useInitializedDuckDBConnectionPool();

  // State management
  const {
    activeFilter,
    setActiveFilter,
    fileTypeFilter,
    setFileTypeFilter,
    searchQuery,
    setSearchQuery,
  } = useDataExplorerState();

  // Data gathering
  const {
    hasActiveElement,
    localDBLocalEntriesMap,
    databaseMetadata,
    flatFileSources,
    flatFileSourcesValues,
    allDataSources,
    localEntriesValues,
    nonLocalDBFileEntries: _nonLocalDBFileEntries,
    fileViewNames,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    initialExpandedState,
  } = useDataExplorerData();

  // Separate databases by type
  const { systemDatabase, localDatabases, remoteDatabases, motherDuckDatabases } = useDatabaseSeparation(allDataSources);

  // Build file system tree
  const fileSystemNodes = useFileSystemTreeBuilder({
    conn,
    allLocalEntries: Array.from(localEntriesValues.values()),
    flatFileSourcesValues,
    nodeMap,
    anyNodeIdToNodeTypeMap,
  });

  // Detect available file types from local entries
  const availableFileTypes = useMemo(() => {
    const fileTypes = new Set<supportedFlatFileDataSourceFileExt>();

    // Check all local entries for file types
    for (const entry of localEntriesValues.values()) {
      if (entry.kind === 'file' && entry.fileType === 'data-source') {
        const { ext } = entry;
        // Only include flat file types (exclude .duckdb)
        if (ext === 'csv' || ext === 'json' || ext === 'parquet' || ext === 'xlsx') {
          fileTypes.add(ext);
        }
      }
    }

    return fileTypes;
  }, [localEntriesValues]);

  // Detect available data source types
  const availableDataSourceTypes = useMemo(() => {
    const hasFiles = fileSystemNodes.length > 0;
    const hasLocalDbs = localDatabases.length > 0;
    const hasRemoteDbs = remoteDatabases.length > 0;
    const hasMotherDuckDbs = motherDuckDatabases.length > 0;

    return {
      files: hasFiles,
      databases: hasLocalDbs,
      remote: hasRemoteDbs,
      motherduck: hasMotherDuckDbs,
    };
  }, [fileSystemNodes.length, localDatabases.length, remoteDatabases.length, motherDuckDatabases.length]);

  // Build database nodes
  const { localDbNodes, remoteDatabaseNodes, motherDuckNodes, systemDbNode, systemDbNodeForDisplay } = useBuildNodes(
    {
      systemDatabase,
      localDatabases,
      remoteDatabases,
      motherDuckDatabases,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      localDBLocalEntriesMap,
      databaseMetadata,
      fileViewNames,
      initialExpandedState,
      flatFileSources,
    },
  );

  // Create unified tree for context
  const unifiedTree = [
    ...(systemDbNode ? [systemDbNode] : []),
    ...fileSystemNodes,
    ...localDbNodes,
    ...remoteDatabaseNodes,
    ...motherDuckNodes,
  ];

  // Actions
  const { handleDeleteSelected, handleShowSchema, getShowSchemaHandlerForNodes } =
    useDataExplorerActions({
      unifiedTree,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });

  // Use the common explorer context hook
  const contextResult = useExplorerContext<DataExplorerNodeTypeMap>({
    nodes: unifiedTree,
    handleDeleteSelected,
    getShowSchemaHandler: getShowSchemaHandlerForNodes,
  });

  // Create the enhanced extra data
  const enhancedExtraData: DataExplorerContext = {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    onShowSchemaForMultiple: handleShowSchema,
    ...contextResult,
  };

  // Use filtering hook
  const { filteredSections, searchExpandedState } = useFilterNodes({
    fileSystemNodes,
    localDbNodes,
    remoteDatabaseNodes,
    motherDuckNodes,
    activeFilter,
    fileTypeFilter,
    searchQuery,
    localEntriesValues,
  });

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <DataExplorerFilters
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        fileTypeFilter={fileTypeFilter}
        onFileTypeFilterChange={setFileTypeFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        availableFileTypes={availableFileTypes}
        availableDataSourceTypes={availableDataSourceTypes}
      />
      <DataExplorerContent
        showSystemDb={filteredSections.showSystemDb}
        systemDbNode={systemDbNodeForDisplay}
        showFileSystem={filteredSections.showFileSystem}
        fileSystemNodes={filteredSections.filteredFileSystemNodes}
        showLocalDbs={filteredSections.showLocalDbs}
        localDbNodes={filteredSections.filteredLocalDbNodes}
        showRemoteDbs={filteredSections.showRemoteDbs}
        remoteDbNodes={filteredSections.filteredRemoteDbNodes}
        showMotherDuckDbs={filteredSections.showMotherDuckDbs}
        motherDuckNodes={filteredSections.filteredMotherDuckNodes}
        initialExpandedState={initialExpandedState}
        searchExpandedState={searchExpandedState}
        extraData={enhancedExtraData}
        hasActiveElement={hasActiveElement}
      />
    </div>
  );
});
