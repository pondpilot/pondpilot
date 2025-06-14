import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useDataSourceIdForActiveTab, useIsLocalDBElementOnActiveTab } from '@store/app-store';

import { DataExplorerNodeTypeMap, DataExplorerContext } from './model';

// Reusable tree node component for the data explorer
export const DataExplorerNode = (
  props: RenderTreeNodePayload<DataExplorerNodeTypeMap, DataExplorerContext>,
) => {
  const { node, tree, flattenedNodeIds, extraData } = props;
  const { value: itemId } = node;

  // Get active data source ID for file system nodes
  const activeDataSourceId = useDataSourceIdForActiveTab();

  // Find the current node index in the flattened list
  const curNodeIndex = flattenedNodeIds.findIndex((id) => id === itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  // Get node info from the node map
  const nodeInfo = extraData.nodeMap.get(itemId);

  // Get database node info for current, prev and next nodes
  const dbNodeInfo = nodeInfo && 'db' in nodeInfo ? nodeInfo : null;
  const prevNodeInfo = prevNodeId ? extraData.nodeMap.get(prevNodeId) : null;
  const nextNodeInfo = nextNodeId ? extraData.nodeMap.get(nextNodeId) : null;
  const prevDbNodeInfo = prevNodeInfo && 'db' in prevNodeInfo ? prevNodeInfo : null;
  const nextDbNodeInfo = nextNodeInfo && 'db' in nextNodeInfo ? nextNodeInfo : null;

  // Call hooks unconditionally (with null values when not applicable)
  const isDbNodeActive = useIsLocalDBElementOnActiveTab(
    dbNodeInfo?.db || null,
    dbNodeInfo?.schemaName || null,
    dbNodeInfo?.objectName || null,
    dbNodeInfo?.columnName || null,
  );

  const isPrevDbNodeActive = useIsLocalDBElementOnActiveTab(
    prevDbNodeInfo?.db || null,
    prevDbNodeInfo?.schemaName || null,
    prevDbNodeInfo?.objectName || null,
    prevDbNodeInfo?.columnName || null,
  );

  const isNextDbNodeActive = useIsLocalDBElementOnActiveTab(
    nextDbNodeInfo?.db || null,
    nextDbNodeInfo?.schemaName || null,
    nextDbNodeInfo?.objectName || null,
    nextDbNodeInfo?.columnName || null,
  );

  // Determine active states based on node type
  let isActive = false;
  let isPrevActive = false;
  let isNextActive = false;

  if (node.nodeType === 'file' || node.nodeType === 'sheet') {
    // Handle file system nodes
    isActive = itemId === activeDataSourceId;
    isPrevActive = prevNodeId === activeDataSourceId;
    isNextActive = nextNodeId === activeDataSourceId;
  } else if (dbNodeInfo) {
    // Handle database nodes
    isActive = isDbNodeActive;
    isPrevActive = isPrevDbNodeActive;
    isNextActive = isNextDbNodeActive;
  }

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? extraData.getOverrideContextMenu(tree.selectedState) : null;

  return (
    <MemoizedBaseTreeNode<DataExplorerNodeTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};

DataExplorerNode.displayName = 'DataExplorerNode';
