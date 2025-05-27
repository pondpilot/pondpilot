import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useIsSqlScriptIdOnActiveTab } from '@store/app-store';

import { ScrtiptNodeTypeToIdTypeMap } from './model';

export const ScriptExplorerNode = (props: RenderTreeNodePayload<ScrtiptNodeTypeToIdTypeMap>) => {
  const { flattenedNodeIds, node, tree, extraData } = props;
  const { value: itemId } = node;
  const curNodeIndex = props.flattenedNodeIds.indexOf(itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  const isActive = useIsSqlScriptIdOnActiveTab(itemId);
  const isPrevActive = useIsSqlScriptIdOnActiveTab(prevNodeId);
  const isNextActive = useIsSqlScriptIdOnActiveTab(nextNodeId);

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? (extraData as any)?.overrideContextMenu : null;

  return (
    <MemoizedBaseTreeNode<ScrtiptNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};
