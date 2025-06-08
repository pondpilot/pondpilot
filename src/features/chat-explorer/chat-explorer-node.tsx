import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useAppStore } from '@store/app-store';

import { ChatExplorerContext, ChatNodeTypeToIdTypeMap } from './model';

const useIsChatIdOnActiveTab = (chatId: string | null): boolean => {
  return useAppStore((state) => {
    if (!chatId || !state.activeTabId) return false;
    const activeTab = state.tabs.get(state.activeTabId);
    return activeTab?.type === 'ai-chat' && activeTab.conversationId === chatId;
  });
};

export const ChatExplorerNode = (
  props: RenderTreeNodePayload<ChatNodeTypeToIdTypeMap, ChatExplorerContext>,
) => {
  const { flattenedNodeIds, node, tree, extraData } = props;
  const { value: itemId } = node;
  const curNodeIndex = props.flattenedNodeIds.indexOf(itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  const isActive = useIsChatIdOnActiveTab(itemId);
  const isPrevActive = useIsChatIdOnActiveTab(prevNodeId);
  const isNextActive = useIsChatIdOnActiveTab(nextNodeId);

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? extraData.getOverrideContextMenu(tree.selectedState) : null;

  return (
    <MemoizedBaseTreeNode<ChatNodeTypeToIdTypeMap>
      {...props}
      isActive={isActive}
      isPrevActive={isPrevActive}
      isNextActive={isNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};
