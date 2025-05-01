import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useIsAttachedDBElementOnActiveTab } from '@store/app-store';

import { DBExplorerNodeExtraType, DBExplorerNodeTypeToIdTypeMap } from './model';

export const DbExplorerNode = (
  props: RenderTreeNodePayload<DBExplorerNodeTypeToIdTypeMap, DBExplorerNodeExtraType>,
) => {
  const { flattenedNodeIds, node, extraData } = props;
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

  return (
    <MemoizedBaseTreeNode<DBExplorerNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
    />
  );
};
