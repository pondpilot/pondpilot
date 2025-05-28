import { TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree/model';
import { PersistentDataSourceId } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';

export type FSExplorerNodeTypeToIdTypeMap = {
  folder: LocalEntryId;
  file: PersistentDataSourceId;
  sheet: PersistentDataSourceId;
};

type FSExplorerNodeExtraMapItem = {};

export type FSExplorerNodeExtraType = Map<
  FSExplorerNodeTypeToIdTypeMap[keyof FSExplorerNodeTypeToIdTypeMap],
  FSExplorerNodeExtraMapItem
>;

// Context type for file system explorer
export type FSExplorerContext = FSExplorerNodeExtraType & {
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<FSExplorerNodeTypeToIdTypeMap>> | null;
  flattenedNodeIds: string[];
  selectedDeleteableNodeIds: string[];
};
