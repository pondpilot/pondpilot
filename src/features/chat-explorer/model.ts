import { TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree/model';
import { ChatConversationId } from '@models/ai-chat';

export type ChatNodeTypeToIdTypeMap = {
  chat: ChatConversationId;
};

// Context type for chat explorer
export type ChatExplorerContext = {
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<ChatNodeTypeToIdTypeMap>> | null;
  flattenedNodeIds: ChatConversationId[];
  selectedDeleteableNodeIds: ChatConversationId[];
};
