import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { useIsSqlScriptIdOnActiveTab } from '@store/app-store';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { ScrtiptNodeTypeToIdTypeMap } from './model';

export const ScriptExplorerNode = (props: RenderTreeNodePayload<ScrtiptNodeTypeToIdTypeMap>) => {
  const { flattenedNodeIds, node } = props;
  const { value: itemId } = node;
  const curNodeIndex = props.flattenedNodeIds.indexOf(itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  const isActive = useIsSqlScriptIdOnActiveTab(itemId);
  const isPrevActive = useIsSqlScriptIdOnActiveTab(prevNodeId);
  const isNextActive = useIsSqlScriptIdOnActiveTab(nextNodeId);

  return (
    <MemoizedBaseTreeNode<ScrtiptNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
    />
  );
};
