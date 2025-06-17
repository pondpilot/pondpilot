import { TreeNodeData } from '@components/explorer-tree';

import { DataExplorerNodeTypeMap } from '../model';
import {
  handleMultiSelectDelete,
  handleMultiSelectShowSchema,
  getShowSchemaHandler,
} from '../utils';

type UseDataExplorerActionsProps = {
  unifiedTree: TreeNodeData<DataExplorerNodeTypeMap>[];
  nodeMap: any;
  anyNodeIdToNodeTypeMap: any;
  conn: any;
  flatFileSources: any;
};

/**
 * Hook to manage data explorer actions
 */
export const useDataExplorerActions = ({
  unifiedTree,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  flatFileSources,
}: UseDataExplorerActionsProps) => {
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

  // Get show schema handler for nodes
  const getShowSchemaHandlerForNodes = (selectedNodes: TreeNodeData<DataExplorerNodeTypeMap>[]) => {
    return getShowSchemaHandler(selectedNodes, {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      flatFileSources,
    });
  };

  return {
    handleDeleteSelected,
    handleShowSchema,
    getShowSchemaHandlerForNodes,
  };
};
