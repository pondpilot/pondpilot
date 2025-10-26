import { TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree/model';
import { SQLScriptId } from '@models/sql-script';
import { TabId } from '@models/tab';

export type ScriptNodeTypeToIdTypeMap = {
  script: SQLScriptId;
  comparison: TabId;
};

// Context type for script explorer
export type ScriptExplorerContext = {
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<ScriptNodeTypeToIdTypeMap>> | null;
  flattenedNodeIds: (SQLScriptId | TabId)[];
  selectedDeleteableNodeIds: (SQLScriptId | TabId)[];
};
