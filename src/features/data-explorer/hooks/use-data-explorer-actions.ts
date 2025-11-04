import { TreeNodeData } from '@components/explorer-tree';
import {
  buildComparisonMenuSectionForSources,
  getComparisonSourceFromNode,
} from '@features/comparison/utils/comparison-integration';
import { ComparisonSource } from '@models/comparison';
import { AnyDataSource, AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';

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
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>;
  dataSources: Map<PersistentDataSourceId, AnyDataSource>;
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
  dataSources,
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

  const buildComparisonMenuSections = (selectedNodes: TreeNodeData<DataExplorerNodeTypeMap>[]) => {
    const sources: ComparisonSource[] = selectedNodes
      .map((node) =>
        getComparisonSourceFromNode(node, {
          nodeMap,
          flatFileSources,
          dataSources,
        }),
      )
      .filter((value): value is ComparisonSource => value !== null);

    if (sources.length !== 2) {
      return null;
    }

    const sections = buildComparisonMenuSectionForSources(sources);
    return sections.length > 0 ? sections : null;
  };

  return {
    handleDeleteSelected,
    handleShowSchema,
    getShowSchemaHandlerForNodes,
    buildComparisonMenuSections,
  };
};
