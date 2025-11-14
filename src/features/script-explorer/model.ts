import { TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree/model';
import { ChatConversationId } from '@models/ai-chat';
import { ComparisonId } from '@models/comparison';
import { SQLScriptId } from '@models/sql-script';

export type ScriptNodeTypeToIdTypeMap = {
  script: SQLScriptId;
  comparison: ComparisonId;
  'ai-chat': ChatConversationId;
};

// Context type for script explorer
export type ScriptExplorerContext = {
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<ScriptNodeTypeToIdTypeMap>> | null;
  flattenedNodes: TreeNodeData<ScriptNodeTypeToIdTypeMap>[];
  flattenedNodeIds: (SQLScriptId | ComparisonId | ChatConversationId)[];
  selectedDeleteableNodeIds: (SQLScriptId | ComparisonId | ChatConversationId)[];
};
