import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useIsAttachedDBElementOnActiveTab } from '@store/app-store';

import { DBNodeTypeMap, DBExplorerContext } from './model';

export const DbExplorerNode = (props: RenderTreeNodePayload<DBNodeTypeMap, DBExplorerContext>) => {
  const { flattenedNodeIds, node, extraData, tree } = props;
  const { value: itemId } = node;

  const { db, schemaName, objectName, columnName } = extraData.get(itemId) ?? {};

  // @ts-expect-error: type of the id is not assignable, but it is correct
  const curNodeIndex = props.flattenedNodeIds.indexOf(itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  const {
    db: prevDb,
    schemaName: prevSchema,
    objectName: prevObject,
    columnName: prevColumn,
  } = prevNodeId ? (extraData.get(prevNodeId) ?? {}) : {};
  const {
    db: nextDb,
    schemaName: nextSchema,
    objectName: nextObject,
    columnName: nextColumn,
  } = nextNodeId ? (extraData.get(nextNodeId) ?? {}) : {};

  const isActive = useIsAttachedDBElementOnActiveTab(db, schemaName, objectName, columnName);
  const isPrevActive = useIsAttachedDBElementOnActiveTab(
    prevDb,
    prevSchema,
    prevObject,
    prevColumn,
  );
  const isNextActive = useIsAttachedDBElementOnActiveTab(
    nextDb,
    nextSchema,
    nextObject,
    nextColumn,
  );

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? extraData.getOverrideContextMenu(tree.selectedState) : null;

  return (
    <MemoizedBaseTreeNode<DBNodeTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};
