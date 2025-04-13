import { PersistentDataSourceId } from '@models/data-source';

export type DBExplorerNodeTypeToIdTypeMap = {
  db: PersistentDataSourceId;
  schema: `${string}.${string}`;
  object: `${string}.${string}.${string}`;
  column: `${string}.${string}.${string}::${string}`;
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
