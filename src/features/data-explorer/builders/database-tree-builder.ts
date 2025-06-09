import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { renameDB } from '@controllers/db-explorer';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB, RemoteDB } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { LocalEntry } from '@models/file-system';
import { copyToClipboard } from '@utils/clipboard';
import { getLocalDBDataSourceName } from '@utils/navigation';
import { reconnectRemoteDatabase, disconnectRemoteDatabase } from '@utils/remote-database';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import { buildSchemaTreeNode } from './database-node-builder';
import { refreshDatabaseMetadata } from '../utils/metadata-refresh';
import { validateDbRename } from '../utils/validation';

interface DatabaseTreeBuilderContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  localDatabases: LocalDB[];
  localDBLocalEntriesMap: Map<string, LocalEntry>;
  databaseMetadata: Map<string, DataBaseModel>;
  fileViewNames?: Set<string>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources?: Map<string, any>;
}

/**
 * Builds a complete database tree node with all schemas, tables, views, and columns
 *
 * This is the main entry point for building database nodes in the data explorer.
 * Handles both local and remote databases with comprehensive functionality:
 *
 * Features:
 * - Auto-expands database nodes by default
 * - Supports renaming for user-added local databases
 * - Provides deletion capability for non-system databases
 * - Special handling for system database (PondPilot) with duck icon
 * - Remote database support with connection state management
 * - Context menus for copying names, schema browsing, refresh/reconnect
 *
 * Remote Database Features:
 * - Connection state display and management
 * - URL copying functionality
 * - Reconnection and disconnection capabilities
 * - Refresh metadata when connected
 *
 * @param dataSource - LocalDB or RemoteDB to build the node for
 * @param isSystemDb - Whether this is the system database (affects labeling and permissions)
 * @param context - Complete builder context with all necessary data and maps
 * @returns TreeNodeData configured as a complete database node with all children
 */
export function buildDatabaseNode(
  dataSource: LocalDB | RemoteDB,
  isSystemDb: boolean,
  context: DatabaseTreeBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { id: dbId, dbName } = dataSource;
  const isRemoteDb = dataSource.type === 'remote-db';
  const {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    localDatabases,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    initialExpandedState,
  } = context;

  // This should always exist unless state is broken, but we are playing safe here
  const localFile =
    dataSource.type === 'attached-db' && dataSource.fileSourceId
      ? localDBLocalEntriesMap.get(dataSource.fileSourceId)
      : null;

  let dbLabel = dbName;
  // Check both isSystemDb flag and dbName for backward compatibility
  if (isSystemDb || dbName === PERSISTENT_DB_NAME) {
    dbLabel = 'PondPilot';
  } else if (localFile) {
    dbLabel = getLocalDBDataSourceName(dbName, localFile);
  }

  // For remote databases, append connection state indicator
  if (isRemoteDb) {
    const remoteDb = dataSource as RemoteDB;
    const stateIcon =
      remoteDb.connectionState === 'connected'
        ? '✓'
        : remoteDb.connectionState === 'connecting'
          ? '⟳'
          : remoteDb.connectionState === 'error'
            ? '⚠'
            : '✕';
    dbLabel = `${dbLabel} ${stateIcon}`;
  }

  nodeMap.set(dbId, { db: dbId, schemaName: null, objectName: null, columnName: null });
  anyNodeIdToNodeTypeMap.set(dbId, 'db');

  const sortedSchemas = databaseMetadata
    .get(dbName)
    ?.schemas?.sort((a: any, b: any) => a.name.localeCompare(b.name));

  // Base context menu items
  const baseContextMenuItems = [
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
    // Only add Refresh for non-remote databases (remote databases have their own Refresh/Reconnect)
    ...(isRemoteDb
      ? []
      : [
          {
            label: 'Refresh',
            onClick: async () => {
              await refreshDatabaseMetadata(conn, [dbName]);
            },
          },
        ]),
  ];

  // Add remote-specific menu items
  const remoteMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = isRemoteDb
    ? [
        {
          label: 'Copy URL',
          onClick: () => {
            copyToClipboard((dataSource as RemoteDB).url, {
              showNotification: true,
              notificationTitle: 'URL Copied',
            });
          },
        },
        {
          label: (dataSource as RemoteDB).connectionState === 'connected' ? 'Refresh' : 'Reconnect',
          onClick: async () => {
            if ((dataSource as RemoteDB).connectionState === 'connected') {
              // Refresh metadata
              await refreshDatabaseMetadata(conn, [dbName]);
            } else {
              // Attempt reconnection
              await reconnectRemoteDatabase(conn, dataSource as RemoteDB);
            }
          },
        },
        ...((dataSource as RemoteDB).connectionState === 'connected'
          ? [
              {
                label: 'Disconnect',
                onClick: async () => {
                  await disconnectRemoteDatabase(conn, dataSource as RemoteDB);
                },
              },
            ]
          : []),
      ]
    : [];

  const onDbRenameSubmit = (node: TreeNodeData<DataExplorerNodeTypeMap>, newName: string): void => {
    newName = newName.trim();
    const db = localDatabases.find((d) => d.id === node.value);
    if (!db) {
      throw new Error(`Local DB with id ${node.value} not found`);
    }
    if (db.dbName === newName) {
      // No need to rename if the name is the same
      return;
    }
    renameDB(db.id, newName, conn);
  };

  return {
    nodeType: 'db',
    value: dbId,
    label: dbLabel,
    iconType: isSystemDb || dbName === PERSISTENT_DB_NAME ? 'duck' : 'db',
    isDisabled: false,
    isSelectable: true,
    renameCallbacks:
      !isSystemDb && !isRemoteDb && localFile?.userAdded
        ? {
            prepareRenameValue: () => dbName,
            validateRename: (node: any, newName: string) =>
              validateDbRename(node, newName, [...localDatabases]),
            onRenameSubmit: (node: any, newName: string) => onDbRenameSubmit(node, newName),
          }
        : undefined,
    onDelete:
      !isSystemDb && (isRemoteDb || localFile?.userAdded)
        ? (node: TreeNodeData<DataExplorerNodeTypeMap>): void => {
            if (node.nodeType === 'db') {
              deleteDataSources(conn, [node.value]);
            }
          }
        : undefined,
    contextMenu: [
      {
        children: [...baseContextMenuItems, ...remoteMenuItems],
      },
    ],
    children: sortedSchemas?.map((schema) =>
      buildSchemaTreeNode({
        dbId,
        dbName,
        schema,
        fileViewNames: isSystemDb ? fileViewNames : undefined,
        conn: isSystemDb ? conn : undefined,
        context: {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          flatFileSources: context.flatFileSources,
        },
        initialExpandedState,
      }),
    ),
  };
}
