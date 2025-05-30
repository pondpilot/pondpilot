import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree';
import { PersistentDataSourceId } from '@models/data-source';

export type DBNodeTypeMap = {
  db: PersistentDataSourceId;
  schema: string; // Use `${dbName}.${schema}`
  object: string; // Use `${dbName}.${schemaName}.${tableName/viewName}`
  column: string; // Use `${dbName}.${schemaName}.${tableName/viewName}::${columnName}`
};

type DBNodeInfo = {
  db: PersistentDataSourceId;
  schemaName: string | null;
  objectName: string | null;
  columnName: string | null;
};

export type DBNodeFQNMap = Map<DBNodeTypeMap[keyof DBNodeTypeMap], DBNodeInfo>;

export type DBExplorerContext = DBNodeFQNMap & {
  onShowSchemaForMultiple: (nodeIds: string[]) => void;
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<DBNodeTypeMap>> | null;
  flattenedNodeIds: string[];
  selectedDeleteableNodeIds: string[];
};
