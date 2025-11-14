import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { ComparisonId } from '@models/comparison';
import { SQLScriptId } from '@models/sql-script';
import { useAppStore, useIsSqlScriptIdOnActiveTab } from '@store/app-store';
import { useShallow } from 'zustand/react/shallow';

import { ScriptExplorerContext, ScriptNodeTypeToIdTypeMap } from './model';

function useIsComparisonActive(comparisonId: ComparisonId | null): boolean {
  return useAppStore(
    useShallow((state) => {
      if (!comparisonId) return false;

      const { activeTabId } = state;
      if (!activeTabId) return false;

      const activeTab = state.tabs.get(activeTabId);
      return activeTab?.type === 'comparison' && activeTab.comparisonId === comparisonId;
    }),
  );
}

export const ScriptExplorerNode = (
  props: RenderTreeNodePayload<ScriptNodeTypeToIdTypeMap, ScriptExplorerContext>,
) => {
  const { node, tree, extraData } = props;
  const { nodeType } = node;

  const { flattenedNodes } = extraData;

  const currentIndex = flattenedNodes.findIndex(
    (flattenedNode) =>
      flattenedNode.value === node.value && flattenedNode.nodeType === node.nodeType,
  );

  const prevNode = currentIndex > 0 ? flattenedNodes[currentIndex - 1] : null;
  const nextNode =
    currentIndex >= 0 && currentIndex < flattenedNodes.length - 1
      ? flattenedNodes[currentIndex + 1]
      : null;

  // Check active state based on node type
  const isScriptActive = useIsSqlScriptIdOnActiveTab(
    nodeType === 'script' ? (node.value as SQLScriptId) : null,
  );
  const isComparisonActive = useIsComparisonActive(
    nodeType === 'comparison' ? (node.value as ComparisonId) : null,
  );
  const isActive = nodeType === 'script' ? isScriptActive : isComparisonActive;

  // Compute adjacent active states for styling
  const isPrevScriptActive = useIsSqlScriptIdOnActiveTab(
    prevNode?.nodeType === 'script' ? (prevNode.value as SQLScriptId) : null,
  );
  const isPrevComparisonActive = useIsComparisonActive(
    prevNode?.nodeType === 'comparison' ? (prevNode.value as ComparisonId) : null,
  );
  const isPrevActive = prevNode
    ? prevNode.nodeType === 'script'
      ? isPrevScriptActive
      : isPrevComparisonActive
    : false;

  const isNextScriptActive = useIsSqlScriptIdOnActiveTab(
    nextNode?.nodeType === 'script' ? (nextNode.value as SQLScriptId) : null,
  );
  const isNextComparisonActive = useIsComparisonActive(
    nextNode?.nodeType === 'comparison' ? (nextNode.value as ComparisonId) : null,
  );
  const isNextActive = nextNode
    ? nextNode.nodeType === 'script'
      ? isNextScriptActive
      : isNextComparisonActive
    : false;

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
