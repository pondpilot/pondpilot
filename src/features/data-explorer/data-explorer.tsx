import { TreeNodeData } from '@components/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { createComparisonWithSources } from '@controllers/tab/comparison-tab-controller';
import { dataSourceToComparisonSource } from '@features/comparison/utils/source-selection';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ComparisonSource } from '@models/comparison';
import { AnyFlatFileDataSource } from '@models/data-source';
import {
  LocalEntryId,
  SUPPORTED_DATA_SOURCE_FILE_EXTS,
  supportedFlatFileDataSourceFileExt,
} from '@models/file-system';
import { memo, useMemo, useCallback } from 'react';

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
    comparisonTableNames,
    comparisonByTableName,
  } = useDataExplorerData();

  // Separate databases by type
  const { systemDatabase, localDatabases, remoteDatabases } = useDatabaseSeparation(allDataSources);

  // Build file system tree
  const fileSystemNodes = useFileSystemTreeBuilder({
    conn,
    allLocalEntries: Array.from(localEntriesValues.values()),
    flatFileSourcesValues,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    databaseMetadata,
    fileViewNames,
    showColumns: true,
  });

  // Detect available file types from local entries
  const availableFileTypes = useMemo(() => {
    const fileTypes = new Set<supportedFlatFileDataSourceFileExt>();

    // Check all local entries for file types
    for (const entry of localEntriesValues.values()) {
      if (entry.kind === 'file' && entry.fileType === 'data-source') {
        const { ext } = entry;
        // Only include flat file types (exclude .duckdb)
        if (ext !== 'duckdb' && SUPPORTED_DATA_SOURCE_FILE_EXTS.includes(ext)) {
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

    return {
      files: hasFiles,
      databases: hasLocalDbs,
      remote: hasRemoteDbs,
    };
  }, [fileSystemNodes.length, localDatabases.length, remoteDatabases.length]);

  // Build database nodes
  const { localDbNodes, remoteDatabaseNodes, systemDbNode, systemDbNodeForDisplay } = useBuildNodes(
    {
      systemDatabase,
      localDatabases,
      remoteDatabases,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      localDBLocalEntriesMap,
      databaseMetadata,
      fileViewNames,
      initialExpandedState,
      flatFileSources,
      comparisonTableNames,
      comparisonByTableName,
    },
  );

  // Create unified tree for context
  const unifiedTree = [
    ...(systemDbNode ? [systemDbNode] : []),
    ...fileSystemNodes,
    ...localDbNodes,
    ...remoteDatabaseNodes,
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

  const flatFileSourceByEntryId = useMemo(() => {
    const map = new Map<LocalEntryId, AnyFlatFileDataSource>();
    flatFileSourcesValues.forEach((source) => {
      if (source.type !== 'xlsx-sheet') {
        map.set(source.fileSourceId, source);
      }
    });
    return map;
  }, [flatFileSourcesValues]);

  const sheetSourceByKey = useMemo(() => {
    const map = new Map<string, AnyFlatFileDataSource>();
    flatFileSourcesValues.forEach((source) => {
      if (source.type === 'xlsx-sheet') {
        map.set(`${source.fileSourceId}::${source.sheetName}`, source);
      }
    });
    return map;
  }, [flatFileSourcesValues]);

  const getComparisonSourceForNode = useCallback(
    (nodeId: string) => {
      const info = nodeMap.get(nodeId);
      if (!info) {
        return null;
      }

      if ('db' in info) {
        const { db, schemaName, objectName } = info;
        if (!db || !schemaName || !objectName) {
          return null;
        }
        const dataSource = allDataSources.get(db);
        if (!dataSource || (dataSource.type !== 'attached-db' && dataSource.type !== 'remote-db')) {
          return null;
        }
        return {
          type: 'table' as const,
          tableName: objectName,
          schemaName,
          databaseName: dataSource.dbName,
        };
      }

      if ('entryId' in info) {
        const { entryId } = info;
        if (!entryId) {
          return null;
        }
        if (info.isSheet) {
          if (!info.sheetName) {
            return null;
          }
          const sheetSource = sheetSourceByKey.get(`${entryId}::${info.sheetName}`);
          return sheetSource ? dataSourceToComparisonSource(sheetSource) : null;
        }

        const fileSource = flatFileSourceByEntryId.get(entryId);
        return fileSource ? dataSourceToComparisonSource(fileSource) : null;
      }

      return null;
    },
    [allDataSources, flatFileSourceByEntryId, sheetSourceByKey, nodeMap],
  );

  const handleCompareDatasets = useCallback(
    (sourceA: ComparisonSource, sourceB: ComparisonSource) => {
      createComparisonWithSources(sourceA, sourceB);
    },
    [],
  );

  const getAdditionalMultiSelectMenu = useCallback(
    (selectedNodes: TreeNodeData<DataExplorerNodeTypeMap>[]) => {
      // Filter to only dataset-level nodes (file, sheet, object) - exclude schema/column children
      const datasetNodes = selectedNodes.filter((node) => {
        const nodeType = anyNodeIdToNodeTypeMap.get(node.value as string);
        return nodeType === 'file' || nodeType === 'sheet' || nodeType === 'object';
      });

      if (datasetNodes.length !== 2) {
        return null;
      }

      const sources: ComparisonSource[] = [];
      for (const node of datasetNodes) {
        const source = getComparisonSourceForNode(node.value as string);
        if (!source) {
          return null;
        }
        sources.push(source);
      }

      if (sources.length !== 2) {
        return null;
      }

      return [
        {
          children: [
            {
              label: 'Compare',
              onClick: () => {
                handleCompareDatasets(sources[0], sources[1]);
              },
            },
          ],
        },
      ];
    },
    [anyNodeIdToNodeTypeMap, getComparisonSourceForNode, handleCompareDatasets],
  );

  // Use the common explorer context hook
  const contextResult = useExplorerContext<DataExplorerNodeTypeMap>({
    nodes: unifiedTree,
    handleDeleteSelected,
    getShowSchemaHandler: getShowSchemaHandlerForNodes,
    getAdditionalMultiSelectMenu,
  });

  // Create the enhanced extra data
  const enhancedExtraData: DataExplorerContext = {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    onShowSchemaForMultiple: handleShowSchema,
    getComparisonSourceForNode,
    ...contextResult,
  };

  // Use filtering hook
  const { filteredSections, searchExpandedState } = useFilterNodes({
    fileSystemNodes,
    localDbNodes,
    remoteDatabaseNodes,
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
        initialExpandedState={initialExpandedState}
        searchExpandedState={searchExpandedState}
        extraData={enhancedExtraData}
        hasActiveElement={hasActiveElement}
      />
    </div>
  );
});
