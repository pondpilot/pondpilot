import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { ComparisonId } from '@models/comparison';
import { NotebookId } from '@models/notebook';
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

function useIsNotebookActive(notebookId: NotebookId | null): boolean {
  return useAppStore(
    useShallow((state) => {
      if (!notebookId) return false;

      const { activeTabId } = state;
      if (!activeTabId) return false;

      const activeTab = state.tabs.get(activeTabId);
      return activeTab?.type === 'notebook' && activeTab.notebookId === notebookId;
    }),
  );
}

function useNodeActive(node: { nodeType: string; value: string } | null): boolean {
  const isScript = useIsSqlScriptIdOnActiveTab(
    node?.nodeType === 'script' ? (node.value as SQLScriptId) : null,
  );
  const isComparison = useIsComparisonActive(
    node?.nodeType === 'comparison' ? (node.value as ComparisonId) : null,
  );
  const isNotebook = useIsNotebookActive(
    node?.nodeType === 'notebook' ? (node.value as NotebookId) : null,
  );

  if (!node) return false;
  if (node.nodeType === 'script') return isScript;
  if (node.nodeType === 'comparison') return isComparison;
  if (node.nodeType === 'notebook') return isNotebook;
  return false;
}

export const ScriptExplorerNode = (
  props: RenderTreeNodePayload<ScriptNodeTypeToIdTypeMap, ScriptExplorerContext>,
) => {
  const { node, tree, extraData } = props;

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

  const isActive = useNodeActive(node);
  const isPrevActive = useNodeActive(prevNode);
  const isNextActive = useNodeActive(nextNode);

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
