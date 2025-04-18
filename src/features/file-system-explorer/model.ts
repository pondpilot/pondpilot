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
