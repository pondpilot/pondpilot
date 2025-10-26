import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { SQLScriptId } from '@models/sql-script';
import { TabId } from '@models/tab';
import { useIsActiveTabId, useIsSqlScriptIdOnActiveTab } from '@store/app-store';

import { ScriptExplorerContext, ScriptNodeTypeToIdTypeMap } from './model';

export const ScriptExplorerNode = (
  props: RenderTreeNodePayload<ScriptNodeTypeToIdTypeMap, ScriptExplorerContext>,
) => {
  const { node, tree, extraData } = props;
  const { nodeType } = node;

  // Check active state based on node type
  // TypeScript can't narrow node.value based on nodeType, so we use explicit type assertions
  // Call both hooks unconditionally to satisfy Rules of Hooks
  const isScriptActive = useIsSqlScriptIdOnActiveTab(node.value as SQLScriptId);
  const isTabActive = useIsActiveTabId(node.value as TabId);
  const isActive = nodeType === 'script' ? isScriptActive : isTabActive;

  // Compute adjacent active states for styling
  const { flattenedNodeIds } = extraData;
  const currentIndex = flattenedNodeIds.indexOf(node.value);
  const prevId = currentIndex > 0 ? flattenedNodeIds[currentIndex - 1] : null;
  const nextId =
    currentIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[currentIndex + 1] : null;

  // Check if adjacent nodes are active (try both script and tab checks)
  const isPrevScriptActive = useIsSqlScriptIdOnActiveTab((prevId ?? '') as SQLScriptId);
  const isPrevTabActive = useIsActiveTabId((prevId ?? '') as TabId);
  const isPrevActive = prevId !== null && (isPrevScriptActive || isPrevTabActive);

  const isNextScriptActive = useIsSqlScriptIdOnActiveTab((nextId ?? '') as SQLScriptId);
  const isNextTabActive = useIsActiveTabId((nextId ?? '') as TabId);
  const isNextActive = nextId !== null && (isNextScriptActive || isNextTabActive);

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? extraData.getOverrideContextMenu(tree.selectedState) : null;

  return (
    <MemoizedBaseTreeNode<ScriptNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};
