import { PersistentDataSourceId } from '@models/data-source';

export type DBExplorerNodeTypeToIdTypeMap = {
  db: PersistentDataSourceId;
  schema: string; // Use `${dbName}.${schema}`
  object: string; // Use `${dbName}.${schemaName}.${tableName/viewName}`
  column: string; // Use `${dbName}.${schemaName}.${tableName/viewName}::${columnName}`
};

type DBExplorerNodeExtraMapItem = {
  db: PersistentDataSourceId;
  schemaName: string | null;
  objectName: string | null;
  columnName: string | null;
};

export type DBExplorerNodeExtraType = Map<
  DBExplorerNodeTypeToIdTypeMap[keyof DBExplorerNodeTypeToIdTypeMap],
  DBExplorerNodeExtraMapItem
>;
