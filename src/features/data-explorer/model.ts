import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree';
import { PersistentDataSourceId } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';

// Unified node type map combining both file system and database nodes
export type DataExplorerNodeTypeMap = {
  // File system nodes
  folder: LocalEntryId;
  file: LocalEntryId;
  sheet: string; // XLSX sheet: `${fileId}::${sheetName}`

  // Database nodes
  db: PersistentDataSourceId;
  schema: string; // Use `${dbId}.${schema}`
  object: string; // Use `${dbId}.${schemaName}.${tableName/viewName}`
  column: string; // Use `${dbId}.${schemaName}.${tableName/viewName}::${columnName}`
  section: string; // Use `${dbId}.${schemaName}.${sectionName}`
};

// Node info for database items (similar to DB explorer)
type DBNodeInfo = {
  db: PersistentDataSourceId | null;
  schemaName: string | null;
  objectName: string | null;
  columnName: string | null;
  objectType?: 'table' | 'view' | 'other';
};

// Node info for file system items
type FileNodeInfo = {
  entryId: LocalEntryId | null;
  isSheet: boolean;
  sheetName: string | null;
  dataSourceId: PersistentDataSourceId | null;
  viewName: string | null;
};

// Combined node info
export type DataExplorerNodeInfo = DBNodeInfo | FileNodeInfo;

// Map to track node types and their info
export type DataExplorerNodeMap = Map<
  DataExplorerNodeTypeMap[keyof DataExplorerNodeTypeMap],
  DataExplorerNodeInfo
>;

// Context passed to tree nodes
export type DataExplorerContext = {
  // Node mapping for navigation
  nodeMap: DataExplorerNodeMap;

  // File system specific
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;

  // Common actions
  onShowSchemaForMultiple: (nodeIds: string[]) => void;
  getOverrideContextMenu: (
    selectedState: string[],
  ) => TreeNodeMenuType<TreeNodeData<DataExplorerNodeTypeMap>> | null;
  flattenedNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  flattenedNodeIds: string[];
  selectedDeleteableNodeIds: string[];
};

// Helper type guards
export function isDBNodeInfo(info: DataExplorerNodeInfo): info is DBNodeInfo {
  return 'db' in info;
}

export function isFileNodeInfo(info: DataExplorerNodeInfo): info is FileNodeInfo {
  return 'entryId' in info;
}
