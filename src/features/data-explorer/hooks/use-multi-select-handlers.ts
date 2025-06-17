import { TreeNodeData } from '@components/explorer-tree';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry } from '@models/file-system';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import {
  handleMultiSelectDelete,
  handleMultiSelectShowSchema,
} from '../utils/multi-select-handlers';

interface MultiSelectHandlersProps {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>;
  allLocalEntries: LocalEntry[];
}

export function useMultiSelectHandlers({
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  flatFileSources,
  allLocalEntries,
}: MultiSelectHandlersProps) {
  // Handle delete selected for mixed types
  const handleDeleteSelected = async (ids: Iterable<string>) => {
    // Convert IDs to TreeNodeData objects
    const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [];

    for (const id of ids) {
      const nodeType = anyNodeIdToNodeTypeMap.get(id);
      const nodeInfo = nodeMap.get(id);

      if (!nodeType || !nodeInfo) {
        console.error(`Node info for id "${id}" is missing`);
        continue;
      }

      // Check if it's a user-added entry (for file system nodes)
      if ('entryId' in nodeInfo && nodeInfo.entryId) {
        const entry = allLocalEntries.find((e) => e.id === nodeInfo.entryId);
        if (!entry?.userAdded) continue;
      }

      // Create a minimal TreeNodeData object for the utility function
      nodes.push({
        value: id,
        label: '', // Not needed for deletion
      } as TreeNodeData<DataExplorerNodeTypeMap>);
    }

    // Use the utility function
    handleMultiSelectDelete(nodes, {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });
  };

  // Handle multi-select show schema - delegate to utility function
  const handleMultiSelectShowSchemaWrapper = (nodeIds: string[]) => {
    handleMultiSelectShowSchema(nodeIds, {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });
  };

  return {
    handleDeleteSelected,
    handleMultiSelectShowSchema: handleMultiSelectShowSchemaWrapper,
  };
}
