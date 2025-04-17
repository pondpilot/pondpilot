import { memo } from 'react';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import {
  useAttachedDBDataSourceMap,
  useAttachedDBLocalEntriesMap,
  useAttachedDBMetadata,
} from '@store/app-store';
import { ExplorerTree, TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { getAttachedDBDataSourceName } from '@utils/navigation';
import { PersistentDataSourceId } from '@models/data-source';
import { DBColumn, DBSchema, DBTableOrView, DBTableOrViewSchema } from '@models/db';
import { NotificationData } from '@mantine/notifications';
import { IconType } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import {
  findTabFromAttachedDBObject,
  getOrCreateTabFromAttachedDBObject,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { createSQLScript } from '@controllers/sql-script';
import { deleteDataSources } from '@controllers/data-source';
import { DBExplorerNodeExtraType, DBExplorerNodeTypeToIdTypeMap } from './model';
import { DbExplorerNode } from './db-explorer-node';

function buildColumnTreeNode({
  dbId,
  schemaName,
  objectName,
  column,
  nodeIdsToFQNMap,
  copy,
  showSuccess,
}: {
  dbId: PersistentDataSourceId;
  schemaName: string;
  objectName: string;
  column: DBColumn;
  // Mutable args
  nodeIdsToFQNMap: DBExplorerNodeExtraType;
  // injected callbacks
  copy: (valueToCopy: any) => void;
  showSuccess: (data: NotificationData) => string;
}): TreeNodeData<DBExplorerNodeTypeToIdTypeMap> {
  const { name: columnName, sqlType } = column;
  const columnNodeId = `${dbId}.${schemaName}.${objectName}::${columnName}`;
  const iconType: IconType = getIconTypeForSQLType(sqlType);

  nodeIdsToFQNMap.set(columnNodeId, {
    db: dbId,
    schemaName,
    objectName,
    columnName,
  });

  return {
    nodeType: 'column',
    value: columnNodeId,
    label: columnName,
    iconType,
    isDisabled: false,
    isSelectable: false,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copy(toDuckDBIdentifier(objectName));
              showSuccess({ title: 'Copied', message: '', autoClose: 800 });
            },
          },
        ],
      },
    ],
  };
}

function buildObjectTreeNode({
  dbId,
  dbName,
  schemaName,
  object,
  nodeIdsToFQNMap,
  copy,
  showSuccess,
}: {
  dbId: PersistentDataSourceId;
  dbName: string;
  schemaName: string;
  object: DBTableOrView;
  // Mutable args
  nodeIdsToFQNMap: DBExplorerNodeExtraType;
  // injected callbacks
  copy: (valueToCopy: any) => void;
  showSuccess: (data: NotificationData) => string;
}): TreeNodeData<DBExplorerNodeTypeToIdTypeMap> {
  const { name: objectName, columns } = object;
  const objectNodeId = `${dbId}.${schemaName}.${objectName}`;

  nodeIdsToFQNMap.set(objectNodeId, {
    db: dbId,
    schemaName,
    objectName,
    columnName: null,
  });

  const fqn = `${toDuckDBIdentifier(dbName)}.${toDuckDBIdentifier(schemaName)}.${toDuckDBIdentifier(objectName)}`;

  // We only allow expanding columns in dev builds as of today
  let sortedColumns: DBTableOrViewSchema = [];
  let devMenuItems: TreeNodeMenuItemType<TreeNodeData<DBExplorerNodeTypeToIdTypeMap>>[] = [];

  if (import.meta.env.DEV) {
    sortedColumns = columns.slice().sort((a, b) => a.name.localeCompare(b.name));
    devMenuItems = [
      {
        label: 'Toggle columns',
        onClick: (node, tree) => tree.toggleExpanded(node.value),
        isDisabled: false,
      },
    ];
  }

  return {
    nodeType: 'object',
    value: objectNodeId,
    label: objectName,
    iconType: object.type === 'table' ? 'db-table' : 'db-view',
    isDisabled: false,
    isSelectable: true,
    doNotExpandOnClick: true,
    onNodeClick: (): void => {
      // Check if the tab is already open
      const existingTab = findTabFromAttachedDBObject(dbId, schemaName, objectName);
      if (existingTab) {
        // If the tab is already open, just set as active and do not change preview
        setActiveTabId(existingTab.id);
        return;
      }

      // Net new. Create an active tab
      const tab = getOrCreateTabFromAttachedDBObject(
        dbId,
        schemaName,
        objectName,
        object.type,
        true,
      );
      // Then set as & preview
      setPreviewTabId(tab.id);
    },
    contextMenu: [
      {
        children: [
          {
            label: 'Copy Full Name',
            onClick: () => {
              copy(fqn);
              showSuccess({ title: 'Copied', message: '', autoClose: 800 });
            },
            onAlt: {
              label: 'Copy Name',
              onClick: () => {
                copy(toDuckDBIdentifier(objectName));
                showSuccess({ title: 'Copied', message: '', autoClose: 800 });
              },
            },
          },
          {
            label: 'Create a Query',
            onClick: () => {
              const query = `SELECT * FROM ${fqn};`;

              const newScript = createSQLScript(`${objectName}_query`, query);
              getOrCreateTabFromScript(newScript, true);
            },
          },
          ...devMenuItems,
        ],
      },
    ],
    children: sortedColumns.map((column) =>
      buildColumnTreeNode({
        dbId,
        schemaName,
        objectName,
        column,
        nodeIdsToFQNMap,
        copy,
        showSuccess,
      }),
    ),
  };
}

function buildSchemaTreeNode({
  dbId,
  dbName,
  schema,
  nodeIdsToFQNMap,
  initialExpandedState,
  copy,
  showSuccess,
}: {
  dbId: PersistentDataSourceId;
  dbName: string;
  schema: DBSchema;
  // Mutable args
  nodeIdsToFQNMap: DBExplorerNodeExtraType;
  initialExpandedState: Record<
    DBExplorerNodeTypeToIdTypeMap[keyof DBExplorerNodeTypeToIdTypeMap],
    boolean
  >;
  // injected callbacks
  copy: (valueToCopy: any) => void;
  showSuccess: (data: NotificationData) => string;
}): TreeNodeData<DBExplorerNodeTypeToIdTypeMap> {
  const { name: schemaName, objects } = schema;
  const schemaNodeId = `${dbId}.${schemaName}`;

  nodeIdsToFQNMap.set(schemaNodeId, {
    db: dbId,
    schemaName,
    objectName: null,
    columnName: null,
  });

  // By default only expand databases & schemas, but not tables. This takes
  // care of the schema
  initialExpandedState[schemaNodeId] = true;

  const sortedObjects = objects.slice().sort((a, b) => a.name.localeCompare(b.name));

  return {
    nodeType: 'schema',
    value: schemaNodeId,
    label: schemaName,
    iconType: 'db-schema',
    isDisabled: false,
    isSelectable: false,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copy(toDuckDBIdentifier(schemaName));
              showSuccess({ title: 'Copied', message: '', autoClose: 800 });
            },
          },
          {
            label: 'Copy Full Name',
            onClick: () => {
              copy(`${toDuckDBIdentifier(dbName)}.${toDuckDBIdentifier(schemaName)}`);
              showSuccess({ title: 'Copied', message: '', autoClose: 800 });
            },
          },
        ],
      },
    ],
    children: sortedObjects.map((object) =>
      buildObjectTreeNode({
        dbId,
        dbName,
        schemaName,
        object,
        nodeIdsToFQNMap,
        copy,
        showSuccess,
      }),
    ),
  };
}

/**
 * Displays attached databases and their schemas/tables/columns
 */
export const DbExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();
  const conn = useInitializedDuckDBConnectionPool();

  /**
   * Store access
   */
  const attachedDBMap = useAttachedDBDataSourceMap();
  const attachedDBLocalEntriesMap = useAttachedDBLocalEntriesMap();
  const dataBaseMetadata = useAttachedDBMetadata();

  /**
   * Local state
   */

  /**
   * Consts
   */
  // We create ids for internal node here in this component, thus
  // we need a local map to get back from id to fully qualified names
  // of various nodes (e.g. for schema we need both dbId and schema name)
  const nodeIdsToFQNMap: DBExplorerNodeExtraType = new Map();

  const initialExpandedState: Record<
    DBExplorerNodeTypeToIdTypeMap[keyof DBExplorerNodeTypeToIdTypeMap],
    boolean
  > = {};

  const sortedDBs = Array.from(attachedDBMap.values()).sort((a, b) =>
    a.dbName.localeCompare(b.dbName),
  );

  const dbObjectsTree: TreeNodeData<DBExplorerNodeTypeToIdTypeMap>[] = sortedDBs.map(
    (attachedDBDataSource) => {
      const { id: dbId, dbName, fileSourceId } = attachedDBDataSource;

      // This should always exist unless state is broken, but we are playing safe here
      const localFile = attachedDBLocalEntriesMap.get(fileSourceId);
      const dbLabel = localFile ? getAttachedDBDataSourceName(dbName, localFile) : dbName;

      nodeIdsToFQNMap.set(dbId, { db: dbId, schemaName: null, objectName: null, columnName: null });

      // By default only expand databases & schemas, but not tables. This takes
      // care of the database
      initialExpandedState[dbId] = true;

      const sortedSchemas = dataBaseMetadata
        .get(dbName)
        ?.schemas?.sort((a, b) => a.name.localeCompare(b.name));

      return {
        nodeType: 'db',
        value: dbId,
        label: dbLabel,
        iconType: 'db',
        isDisabled: false,
        isSelectable: false,
        // TODO: implement renaming of database aliases
        renameCallbacks: {
          validateRename: () => {
            throw new Error('TODO: implement renaming of database aliases');
          },
          onRenameSubmit: () => {
            throw new Error('TODO: implement renaming of database aliases');
          },
        },
        onDelete: (node: TreeNodeData<DBExplorerNodeTypeToIdTypeMap>): void => {
          if (node.nodeType === 'db') {
            deleteDataSources(conn, [node.value]);
          }
        },
        contextMenu: [
          {
            children: [
              {
                label: 'Copy name',
                onClick: () => {
                  // we can't use label as it may not be "just" name
                  copy(dbName);
                  showSuccess({ title: 'Copied', message: '', autoClose: 800 });
                },
              },
            ],
          },
        ],
        children: sortedSchemas?.map((schema) =>
          buildSchemaTreeNode({
            dbId,
            dbName,
            schema,
            nodeIdsToFQNMap,
            initialExpandedState,
            copy,
            showSuccess,
          }),
        ),
      };
    },
  );

  const handleDeleteSelected = async (ids: Iterable<string | PersistentDataSourceId>) => {
    // This should only be called for dbs, but we'll be safe
    const dbIds = Array.from(ids)
      .map((id) => nodeIdsToFQNMap.get(id))
      .filter((fqn) => fqn !== undefined)
      .map((fqn) => fqn.db);

    deleteDataSources(conn, dbIds);
  };

  return (
    <ExplorerTree<DBExplorerNodeTypeToIdTypeMap, DBExplorerNodeExtraType>
      nodes={dbObjectsTree}
      initialExpandedState={initialExpandedState}
      extraData={nodeIdsToFQNMap}
      dataTestIdPrefix="db-explorer"
      TreeNodeComponent={DbExplorerNode}
      onDeleteSelected={handleDeleteSelected}
    />
  );
});
