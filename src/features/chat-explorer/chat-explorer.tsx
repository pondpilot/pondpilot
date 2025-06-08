import { ExplorerTree } from '@components/explorer-tree/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree/model';
import { aiChatController } from '@controllers/ai-chat';
import { deletePersistedConversation, updatePersistedConversation } from '@controllers/ai-chat/persist';
import {
  deleteTabByConversationId,
  findTabFromConversation,
  getOrCreateTabFromConversation,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { showNotification } from '@mantine/notifications';
import { ChatConversation, ChatConversationId } from '@models/ai-chat';
import { useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { memo, useEffect, useState } from 'react';

import { ChatExplorerNode } from './chat-explorer-node';
import { ChatExplorerContext, ChatNodeTypeToIdTypeMap } from './model';

// Validation function for renaming conversations
const validateRename = (
  node: TreeNodeData<ChatNodeTypeToIdTypeMap>,
  newName: string,
  conversations: ChatConversation[],
): string | null => {
  const textInputError = newName.length === 0 ? 'Title cannot be empty' : undefined;
  const notUniqueError = conversations
    .filter((conv) => conv.id !== node.value)
    .some((conv) => conv.title?.toLowerCase() === newName.toLowerCase())
    ? 'Title must be unique'
    : undefined;

  return textInputError || notUniqueError || null;
};

// Prepare value for rename (returns current title)
const prepareRenameValue = (node: TreeNodeData<ChatNodeTypeToIdTypeMap>): string => node.label;

// Click handler for chat nodes
const onNodeClick = (node: TreeNodeData<ChatNodeTypeToIdTypeMap>, _tree: any): void => {
  const conversationId = node.value;

  // Check if the tab is already open
  const existingTab = findTabFromConversation(conversationId);
  if (existingTab) {
    // If the tab is already open, just set as active
    setActiveTabId(existingTab.id);
    return;
  }

  // Create a new tab for this conversation
  const tab = getOrCreateTabFromConversation(conversationId, true);
  // Set as preview
  setPreviewTabId(tab.id);
};

const onCloseItemClick = (node: TreeNodeData<ChatNodeTypeToIdTypeMap>): void => {
  deleteTabByConversationId(node.value);
};

const onDelete = async (node: TreeNodeData<ChatNodeTypeToIdTypeMap>): Promise<void> => {
  // Delete the conversation
  await deletePersistedConversation(node.value);

  showNotification({
    message: 'Chat conversation deleted',
    color: 'green',
  });
};

export const ChatExplorer = memo(() => {
  // Local state to store conversations
  const [conversations, setConversations] = useState(() =>
    aiChatController.getAllConversations()
  );

  // Update when conversations change
  useEffect(() => {
    const updateConversations = () => {
      setConversations(aiChatController.getAllConversations());
    };

    // Initial load
    updateConversations();

    // Listen for storage events (cross-tab updates)
    const handleStorageChange = () => {
      updateConversations();
    };

    window.addEventListener('storage', handleStorageChange);

    // Also update when app state changes
    const unsubscribe = useAppStore.subscribe(() => updateConversations());

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      unsubscribe();
    };
  }, []);

  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'ai-chat';
  });

  // Sort conversations by updated date (most recent first)
  const sortedConversations = [...conversations].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const contextMenu: TreeNodeMenuType<TreeNodeData<ChatNodeTypeToIdTypeMap>> = [
    {
      children: [
        {
          label: 'Copy title',
          onClick: (chatNode) => {
            copyToClipboard(chatNode.label, { showNotification: true });
          },
        },
        {
          label: 'Rename',
          onClick: (chatNode, tree) => {
            tree.startRenaming(chatNode.value);
          },
        },
      ],
    },
  ];

  const chatTree: TreeNodeData<ChatNodeTypeToIdTypeMap>[] = sortedConversations.map(
    (conversation) => {
      // Generate a display name for the conversation
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      const title = conversation.title ||
        (lastMessage?.role === 'user' ?
          lastMessage.content.slice(0, 50) + (lastMessage.content.length > 50 ? '...' : '') :
          'Untitled chat');

      const updatedDate = new Date(conversation.updatedAt);
      const dateStr = updatedDate.toLocaleDateString();
      const timeStr = updatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        nodeType: 'chat',
        value: conversation.id,
        label: title,
        description: `${dateStr} ${timeStr}`,
        iconType: 'ai-message',
        isDisabled: false,
        isSelectable: true,
        onNodeClick,
        onDelete,
        onCloseItemClick,
        contextMenu,
        renameCallbacks: {
          validateRename: (node: any, newName: string) =>
            validateRename(node, newName, conversations),
          onRenameSubmit: async (node: any, newName: string) => {
            await updatePersistedConversation(node.value, { title: newName });

            // Update the tab title if it's open
            const tab = findTabFromConversation(node.value);
            if (tab) {
              const { tabs } = useAppStore.getState();
              const newTabs = new Map(tabs);
              newTabs.set(tab.id, { ...tab });
              useAppStore.setState({ tabs: newTabs });
            }
          },
          prepareRenameValue,
        },
        // no children
      } as TreeNodeData<ChatNodeTypeToIdTypeMap>;
    }
  );

  // Use the common explorer context hook
  const enhancedExtraData = useExplorerContext<ChatNodeTypeToIdTypeMap>({
    nodes: chatTree,
    handleDeleteSelected: async (ids) => {
      // Delete all selected conversations
      for (const id of ids) {
        await deletePersistedConversation(id as ChatConversationId);
      }

      showNotification({
        message: `Deleted ${ids.length} conversation${ids.length > 1 ? 's' : ''}`,
        color: 'green',
      });
    },
  }) as ChatExplorerContext;

  return (
    <ExplorerTree<ChatNodeTypeToIdTypeMap, ChatExplorerContext>
      nodes={chatTree}
      dataTestIdPrefix="chat-explorer"
      TreeNodeComponent={ChatExplorerNode}
      hasActiveElement={hasActiveElement}
      extraData={enhancedExtraData}
    />
  );
});
