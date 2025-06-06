import { ExplorerTree, TreeNodeData } from '@components/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Text, Stack, ScrollArea } from '@mantine/core';
import { LocalDB, RemoteDB, SYSTEM_DATABASE_ID } from '@models/data-source';
import {
  useAppStore,
  useFlatFileDataSourceMap,
  useLocalDBLocalEntriesMap,
  useLocalDBMetadata,
} from '@store/app-store';
import { memo, useMemo, useState, useCallback } from 'react';

import { buildDatabaseNode } from './builders/database-tree-builder';
import {
  DataExplorerFilters,
  DataExplorerFilterType,
  FileTypeFilter,
} from './components/data-explorer-filters';
import { useFileSystemTreeBuilder } from './components/file-system-tree-builder';
import { DataExplorerNode } from './data-explorer-node';
import { DataExplorerContext, DataExplorerNodeMap, DataExplorerNodeTypeMap } from './model';
import {
  filterTreeNodes,
  handleMultiSelectDelete,
  handleMultiSelectShowSchema,
  getShowSchemaHandler,
} from './utils';

/**
 * Unified data explorer that combines file system and database exploration
 */
export const DataExplorer = memo(() => {
  /**
   * Common hooks
   */
  const conn = useInitializedDuckDBConnectionPool();
  const [activeFilter, setActiveFilter] = useState<DataExplorerFilterType>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>({
    csv: true,
    json: true,
    parquet: true,
    xlsx: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Store access
   */
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

  // These are the node state maps that get passed as extra data to the explorer tree
  const nodeMap: DataExplorerNodeMap = new Map();
  const anyNodeIdToNodeTypeMap = new Map<string, keyof DataExplorerNodeTypeMap>();

  // Build initial expanded state
  const initialExpandedState: Record<string, boolean> = {};

  // Get all file view names from flat file sources for identification
  const fileViewNames = useMemo(
    () => new Set(flatFileSourcesValues.map((source) => source.viewName)),
    [flatFileSourcesValues],
  );

  // Separate databases by type
  const { systemDatabase, localDatabases, remoteDatabases } = useMemo(() => {
    let systemDb: LocalDB | undefined;
    const localDbs: LocalDB[] = [];
    const remoteDbs: RemoteDB[] = [];

    allDataSources.forEach((dataSource) => {
      if (dataSource.type === 'attached-db') {
        if (dataSource.id === SYSTEM_DATABASE_ID) {
          systemDb = dataSource;
        } else {
          localDbs.push(dataSource);
        }
      } else if (dataSource.type === 'remote-db') {
        remoteDbs.push(dataSource);
      }
    });

    // Sort databases
    localDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));
    remoteDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));

    return { systemDatabase: systemDb, localDatabases: localDbs, remoteDatabases: remoteDbs };
  }, [allDataSources]);

  // Build file system tree
  const fileSystemNodes = useFileSystemTreeBuilder({
    conn,
    allLocalEntries: nonLocalDBFileEntries,
    flatFileSourcesValues,
    nodeMap,
    anyNodeIdToNodeTypeMap,
  });

  // Build local database nodes
  const localDbNodes = useMemo(
    () =>
      localDatabases.map((db) =>
        buildDatabaseNode(db, false, {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          conn,
          localDatabases,
          localDBLocalEntriesMap,
          databaseMetadata,
          fileViewNames,
          initialExpandedState,
          flatFileSources,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      localDatabases,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      localDBLocalEntriesMap,
      databaseMetadata,
      fileViewNames,
      flatFileSources,
    ],
  );

  // Build remote database nodes
  const remoteDatabaseNodes = useMemo(
    () =>
      remoteDatabases.map((db) =>
        buildDatabaseNode(db, false, {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          conn,
          localDatabases: [],
          localDBLocalEntriesMap: new Map(),
          databaseMetadata,
          initialExpandedState,
          flatFileSources,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteDatabases, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
  );

  // Build system database node if it exists
  const systemDbNode = systemDatabase
    ? buildDatabaseNode(systemDatabase, true, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        localDatabases: [],
        localDBLocalEntriesMap,
        databaseMetadata,
        fileViewNames,
        initialExpandedState,
        flatFileSources,
      })
    : null;

  // Create unified tree for context
  const unifiedTree = [
    ...(systemDbNode ? [systemDbNode] : []),
    ...fileSystemNodes,
    ...localDbNodes,
    ...remoteDatabaseNodes,
  ];

  // Handle multi-select delete
  const handleDeleteSelected = (nodeIds: string[]) => {
    // Build a flat list of all nodes for easier lookup
    const getAllNodes = (
      nodes: TreeNodeData<DataExplorerNodeTypeMap>[],
    ): TreeNodeData<DataExplorerNodeTypeMap>[] => {
      const result: TreeNodeData<DataExplorerNodeTypeMap>[] = [];
      nodes.forEach((node) => {
        result.push(node);
        if (node.children) {
          result.push(...getAllNodes(node.children));
        }
      });
      return result;
    };

    const allNodes = getAllNodes(unifiedTree);
    const nodes = nodeIds
      .map((id) => allNodes.find((node) => node.value === id))
      .filter((node): node is TreeNodeData<DataExplorerNodeTypeMap> => node !== undefined);

    handleMultiSelectDelete(nodes, {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });
  };

  // Handle multi-select show schema
  const handleShowSchema = (nodeIds: string[]) => {
    handleMultiSelectShowSchema(nodeIds, {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });
  };

  // Use the common explorer context hook
  const contextResult = useExplorerContext<DataExplorerNodeTypeMap>({
    nodes: unifiedTree,
    handleDeleteSelected,
    getShowSchemaHandler: (selectedNodes) => {
      return getShowSchemaHandler(selectedNodes, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        flatFileSources,
      });
    },
  });

  // Create the enhanced extra data
  const enhancedExtraData: DataExplorerContext = {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    onShowSchemaForMultiple: handleShowSchema,
    ...contextResult,
  };

  // Ensure system database node is always available for display
  const systemDbNodeForDisplay = systemDbNode || {
    nodeType: 'db' as const,
    value: SYSTEM_DATABASE_ID,
    label: 'PondPilot',
    iconType: 'duck' as const,
    isDisabled: false,
    isSelectable: false,
    contextMenu: [],
    children: [],
  };

  // Helper function to extract file extension from node
  const getFileExtension = useCallback(
    (node: TreeNodeData<DataExplorerNodeTypeMap>) => {
      if (node.nodeType === 'file') {
        // Get the local entry from the store
        const entry = localEntriesValues.get(node.value);
        if (entry && entry.kind === 'file' && entry.fileType === 'data-source') {
          return entry.ext;
        }
      }
      return null;
    },
    [localEntriesValues],
  );

  // Filter nodes and compute expanded state based on search
  const { filteredSections, searchExpandedState } = useMemo(() => {
    const showSystemDb = activeFilter === 'all' || activeFilter === 'databases';
    const showFileSystem =
      activeFilter === 'all' || activeFilter === 'folders' || activeFilter === 'files';
    const showLocalDbs = activeFilter === 'all' || activeFilter === 'databases';
    const showRemoteDbs = activeFilter === 'all' || activeFilter === 'remote';

    // Create a new expanded state for search
    const expandedState: Record<string, boolean> = {};

    const filteredFileSystemNodes = filterTreeNodes(
      fileSystemNodes,
      activeFilter,
      fileTypeFilter,
      getFileExtension,
      searchQuery,
      expandedState,
    );

    // Apply search to database nodes if search is active
    const filteredLocalDbNodes = searchQuery
      ? filterTreeNodes(localDbNodes, 'all', undefined, undefined, searchQuery, expandedState)
      : localDbNodes;

    const filteredRemoteDbNodes = searchQuery
      ? filterTreeNodes(
          remoteDatabaseNodes,
          'all',
          undefined,
          undefined,
          searchQuery,
          expandedState,
        )
      : remoteDatabaseNodes;

    return {
      filteredSections: {
        showSystemDb,
        showFileSystem,
        showLocalDbs,
        showRemoteDbs,
        filteredFileSystemNodes,
        filteredLocalDbNodes,
        filteredRemoteDbNodes,
      },
      searchExpandedState: searchQuery ? expandedState : {},
    };
  }, [
    activeFilter,
    fileSystemNodes,
    fileTypeFilter,
    getFileExtension,
    searchQuery,
    localDbNodes,
    remoteDatabaseNodes,
  ]);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <DataExplorerFilters
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        fileTypeFilter={fileTypeFilter}
        onFileTypeFilterChange={setFileTypeFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <ScrollArea className="flex-1" offsetScrollbars scrollbarSize={8}>
        <Stack gap="xs" className="pb-4">
          {/* System database (pondpilot) - always visible */}
          {filteredSections.showSystemDb && (
            <ExplorerTree<DataExplorerNodeTypeMap, DataExplorerContext>
              nodes={[systemDbNodeForDisplay]}
              initialExpandedState={{ ...initialExpandedState, ...searchExpandedState }}
              extraData={enhancedExtraData}
              dataTestIdPrefix="data-explorer-system"
              TreeNodeComponent={DataExplorerNode}
              hasActiveElement={hasActiveElement}
            />
          )}

          {/* File system tree */}
          {filteredSections.showFileSystem &&
            filteredSections.filteredFileSystemNodes.length > 0 && (
              <ExplorerTree<DataExplorerNodeTypeMap, DataExplorerContext>
                nodes={filteredSections.filteredFileSystemNodes}
                initialExpandedState={{ ...initialExpandedState, ...searchExpandedState }}
                extraData={enhancedExtraData}
                dataTestIdPrefix="data-explorer-fs"
                TreeNodeComponent={DataExplorerNode}
                hasActiveElement={hasActiveElement}
              />
            )}

          {/* Local databases section */}
          {filteredSections.showLocalDbs && filteredSections.filteredLocalDbNodes.length > 0 && (
            <Stack gap={0}>
              <Text size="sm" fw={600} c="dimmed" px="xs" py={4}>
                Local Databases
              </Text>
              <ExplorerTree<DataExplorerNodeTypeMap, DataExplorerContext>
                nodes={filteredSections.filteredLocalDbNodes}
                initialExpandedState={{ ...initialExpandedState, ...searchExpandedState }}
                extraData={enhancedExtraData}
                dataTestIdPrefix="data-explorer-local"
                TreeNodeComponent={DataExplorerNode}
                hasActiveElement={hasActiveElement}
              />
            </Stack>
          )}

          {/* Remote databases section */}
          {filteredSections.showRemoteDbs && filteredSections.filteredRemoteDbNodes.length > 0 && (
            <Stack gap={0}>
              <Text size="sm" fw={600} c="dimmed" px="xs" py={4}>
                Remote Databases
              </Text>
              <ExplorerTree<DataExplorerNodeTypeMap, DataExplorerContext>
                nodes={filteredSections.filteredRemoteDbNodes}
                initialExpandedState={{ ...initialExpandedState, ...searchExpandedState }}
                extraData={enhancedExtraData}
                dataTestIdPrefix="data-explorer-remote"
                TreeNodeComponent={DataExplorerNode}
                hasActiveElement={hasActiveElement}
              />
            </Stack>
          )}
        </Stack>
      </ScrollArea>
    </div>
  );
});
