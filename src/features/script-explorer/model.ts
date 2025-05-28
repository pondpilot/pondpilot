import { TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree/model';
import { SQLScriptId } from '@models/sql-script';

export type ScrtiptNodeTypeToIdTypeMap = {
  script: SQLScriptId;
};

// Context type for script explorer
export type ScriptExplorerContext = {
  overrideContextMenu: TreeNodeMenuType<TreeNodeData<ScrtiptNodeTypeToIdTypeMap>> | null;
  flattenedNodeIds: SQLScriptId[];
  selectedDeleteableNodeIds: SQLScriptId[];
};
