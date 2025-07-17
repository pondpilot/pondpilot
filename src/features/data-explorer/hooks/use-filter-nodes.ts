import { TreeNodeData } from '@components/explorer-tree/model';
import { useMemo, useCallback } from 'react';

import { FileTypeFilter, DataExplorerFilterType } from '../components/data-explorer-filters';
import { DataExplorerNodeTypeMap } from '../model';
import { filterTreeNodes } from '../utils';

type UseFilterNodesProps = {
  fileSystemNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  localDbNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  remoteDatabaseNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  activeFilter: DataExplorerFilterType;
  fileTypeFilter: FileTypeFilter;
  searchQuery: string;
  localEntriesValues: Map<string, any>;
};

export const useFilterNodes = ({
  fileSystemNodes,
  localDbNodes,
  remoteDatabaseNodes,
  activeFilter,
  fileTypeFilter,
  searchQuery,
  localEntriesValues,
}: UseFilterNodesProps) => {
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
    const showAll = activeFilter === 'all';
    const showSystemDb = showAll || activeFilter === 'databases';
    const showFileSystem = showAll || activeFilter === 'files';
    const showLocalDbs = showAll || activeFilter === 'databases';
    const showRemoteDbs = showAll || activeFilter === 'remote';

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

  return { filteredSections, searchExpandedState };
};
