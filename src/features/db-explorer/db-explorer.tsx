import { showWarning } from '@components/app-notifications';
import { ExplorerTree, TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { IconType } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { deleteDataSources } from '@controllers/data-source';
import { renameDB } from '@controllers/db-explorer';
import { createSQLScript } from '@controllers/sql-script';
import {
  findTabFromAttachedDBObject,
  getOrCreateTabFromAttachedDBObject,
  getOrCreateTabFromScript,
  getOrCreateSchemaBrowserTab,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { PersistentDataSourceId, AttachedDB } from '@models/data-source';
import { DBColumn, DBSchema, DBTableOrView, DBTableOrViewSchema } from '@models/db';
import {
  useAppStore,
  useAttachedDBDataSourceMap,
  useAttachedDBLocalEntriesMap,
  useAttachedDBMetadata,
} from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { getAttachedDBDataSourceName } from '@utils/navigation';
import { memo } from 'react';

import { DbExplorerNode } from './db-explorer-node';
import { DBNodeFQNMap, DBNodeTypeMap, DBExplorerContext } from './model';

function buildColumnTreeNode({
  dbId,
  schemaName,
  objectName,
  column,
  nodeIdsToFQNMap,
}: {
  dbId: PersistentDataSourceId;
  schemaName: string;
  objectName: string;
  column: DBColumn;
  // Mutable args
  nodeIdsToFQNMap: DBNodeFQNMap;
  // injected callbacks
}): TreeNodeData<DBNodeTypeMap> {
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
              copyToClipboard(toDuckDBIdentifier(objectName), {
                showNotification: true,
                notificationTitle: 'Copied',
              });
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
}: {
  dbId: PersistentDataSourceId;
  dbName: string;
  schemaName: string;
  object: DBTableOrView;
  // Mutable args
  nodeIdsToFQNMap: DBNodeFQNMap;
}): TreeNodeData<DBNodeTypeMap> {
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
  let devMenuItems: TreeNodeMenuItemType<TreeNodeData<DBNodeTypeMap>>[] = [];

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
    onNodeClick: (_node: any, _tree: any): void => {
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
              copyToClipboard(fqn, {
                showNotification: true,
              });
            },
            onAlt: {
              label: 'Copy Name',
              onClick: () => {
                copyToClipboard(toDuckDBIdentifier(objectName), {
                  showNotification: true,
                });
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
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: dbId,
                sourceType: 'db',
                schemaName,
                objectNames: [objectName],
                setActive: true,
              });
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
}: {
  dbId: PersistentDataSourceId;
  dbName: string;
  schema: DBSchema;
  // Mutable args
  nodeIdsToFQNMap: DBNodeFQNMap;
  initialExpandedState: Record<DBNodeTypeMap[keyof DBNodeTypeMap], boolean>;
}): TreeNodeData<DBNodeTypeMap> {
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
              navigator.clipboard.writeText(toDuckDBIdentifier(schemaName));
              copyToClipboard(toDuckDBIdentifier(schemaName), {
                showNotification: true,
              });
            },
          },
          {
            label: 'Copy Full Name',
            onClick: () => {
              copyToClipboard(`${toDuckDBIdentifier(dbName)}.${toDuckDBIdentifier(schemaName)}`, {
                showNotification: true,
              });
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: dbId,
                sourceType: 'db',
                schemaName,
                setActive: true,
              });
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
  const conn = useInitializedDuckDBConnectionPool();

  /**
   * Store access
   */
  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'data-source' && activeTab?.dataSourceType === 'db';
  });
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
  const nodeIdsToFQNMap: DBNodeFQNMap = new Map();

  const initialExpandedState: Record<DBNodeTypeMap[keyof DBNodeTypeMap], boolean> = {};

  const sortedDBs = Array.from(attachedDBMap.values()).sort((a, b) =>
    a.dbName.localeCompare(b.dbName),
  );

  const validateRename = (
    node: TreeNodeData<DBNodeTypeMap>,
    newName: string,
    dbList: AttachedDB[],
  ): string | null => {
    newName = newName.trim();

    if (newName.length === 0) {
      return 'Name cannot be empty';
    }

    if (
      dbList.some((db) => db.id !== node.value && db.dbName.toLowerCase() === newName.toLowerCase())
    ) {
      return 'Name must be unique';
    }

    return null;
  };

  const onRenameSubmit = (node: TreeNodeData<DBNodeTypeMap>, newName: string): void => {
    newName = newName.trim();
    const db = attachedDBMap.get(node.value as PersistentDataSourceId);
    if (!db) {
      throw new Error(`Attached DB with id ${node.value} not found`);
    }
    if (db.dbName === newName) {
      // No need to rename if the name is the same
      return;
    }
    renameDB(db.id, newName, conn);
  };

  const dbObjectsTree: TreeNodeData<DBNodeTypeMap>[] = sortedDBs.map((attachedDBDataSource) => {
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
      renameCallbacks: {
        prepareRenameValue: () => dbName,
        validateRename: (node: any, newName: string) => validateRename(node, newName, sortedDBs),
        onRenameSubmit: (node: any, newName: string) => onRenameSubmit(node, newName),
      },
      onDelete: localFile?.userAdded
        ? (node: TreeNodeData<DBNodeTypeMap>): void => {
            if (node.nodeType === 'db') {
              deleteDataSources(conn, [node.value]);
            }
          }
        : undefined,
      contextMenu: [
        {
          children: [
            {
              label: 'Copy name',
              onClick: () => {
                // we can't use label as it may not be "just" name
                copyToClipboard(dbName, {
                  showNotification: true,
                });
              },
            },
            {
              label: 'Show Schema',
              onClick: () => {
                const firstSchema = sortedSchemas?.[0];
                getOrCreateSchemaBrowserTab({
                  sourceId: dbId,
                  sourceType: 'db',
                  schemaName: firstSchema?.name,
                  setActive: true,
                });
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
        }),
      ),
    } as any;
  });

  const handleDeleteSelected = async (ids: Iterable<string | PersistentDataSourceId>) => {
    // This should only be called for dbs, but we'll be safe
    const dbIds = Array.from(ids)
      .map((id) => nodeIdsToFQNMap.get(id))
      .filter((fqn) => fqn !== undefined)
      .map((fqn) => fqn.db);

    deleteDataSources(conn, dbIds);
  };

  const handleMultiSelectShowSchema = (nodeIds: string[]) => {
    // Get the FQN info for all selected nodes
    const selectedNodesInfo = nodeIds
      .map((id) => nodeIdsToFQNMap.get(id))
      .filter((info) => info !== undefined);

    if (selectedNodesInfo.length === 0) return;

    // Ensure all nodes are from the same schema
    const firstNode = selectedNodesInfo[0];
    const sameSchemaNodes = selectedNodesInfo.every(
      (node) => node.db === firstNode.db && node.schemaName === firstNode.schemaName,
    );

    if (!sameSchemaNodes) {
      showWarning({
        title: 'Schema Mismatch',
        message: 'All selected items must belong to the same database schema',
      });
      return;
    }

    const objectNames = selectedNodesInfo
      .filter((node) => node.objectName !== null)
      .map((node) => node.objectName!);

    if (objectNames.length > 0) {
      getOrCreateSchemaBrowserTab({
        sourceId: firstNode.db,
        sourceType: 'db',
        schemaName: firstNode.schemaName!,
        objectNames,
        setActive: true,
      });
    }
  };

  // Use the common explorer context hook
  const contextResult = useExplorerContext<DBNodeTypeMap>({
    nodes: dbObjectsTree,
    handleDeleteSelected,
    getShowSchemaHandler: (selectedNodes) => {
      // Additional logic for DB explorer - only show schema if all nodes are tables/views
      const areAllNodesOfSameType = selectedNodes.every(
        (node) => node?.nodeType === selectedNodes[0]?.nodeType,
      );

      return areAllNodesOfSameType && selectedNodes[0]?.nodeType === 'object'
        ? (ids: string[]) => handleMultiSelectShowSchema(ids)
        : undefined;
    },
  });

  // Create the enhanced extra data combining the map and the context result
  const enhancedExtraData: DBExplorerContext = Object.assign(nodeIdsToFQNMap, contextResult, {
    onShowSchemaForMultiple: handleMultiSelectShowSchema,
  });

  return (
    <ExplorerTree<DBNodeTypeMap, DBExplorerContext>
      nodes={dbObjectsTree}
      initialExpandedState={initialExpandedState}
      extraData={enhancedExtraData}
      dataTestIdPrefix="db-explorer"
      TreeNodeComponent={DbExplorerNode}
      hasActiveElement={hasActiveElement}
    />
  );
});
