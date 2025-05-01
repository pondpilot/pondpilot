import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useDataSourceIdForActiveTab } from '@store/app-store';

import { FSExplorerNodeExtraType, FSExplorerNodeTypeToIdTypeMap } from './model';

export const FileSystemExplorerNode = (
  props: RenderTreeNodePayload<FSExplorerNodeTypeToIdTypeMap, FSExplorerNodeExtraType>,
) => {
  const { flattenedNodeIds, node } = props;
  const { value: itemId } = node;

  // @ts-expect-error: type of the id is not assignable, but it is correct
  const curNodeIndex = props.flattenedNodeIds.indexOf(itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  const activeDataSourceId = useDataSourceIdForActiveTab();

  const isActive = itemId === activeDataSourceId;
  const isPrevActive = prevNodeId === activeDataSourceId;
  const isNextActive = nextNodeId === activeDataSourceId;

  return (
    <MemoizedBaseTreeNode<FSExplorerNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
    />
  );
};
