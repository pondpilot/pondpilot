import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { renameDB } from '@controllers/db-explorer';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { IcebergCatalog, LocalDB, MotherDuckConnection, RemoteDB } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { LocalEntry } from '@models/file-system';
import { useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { disconnectIcebergCatalog } from '@utils/iceberg-catalog';
import {
  disconnectMotherDuckConnection,
  getMotherDuckDatabaseModel,
  listMotherDuckDatabases,
} from '@utils/motherduck';
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
  comparisonTableNames?: Set<string>;
  comparisonByTableName?: Map<string, Comparison>;
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
    comparisonTableNames,
    comparisonByTableName,
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
        nodeDbId: dbId,
        sourceDbId: dbId,
        dbName,
        schema,
        fileViewNames: isSystemDb ? fileViewNames : undefined,
        comparisonTableNames: isSystemDb ? comparisonTableNames : undefined,
        conn: isSystemDb ? conn : undefined,
        context: {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          flatFileSources: context.flatFileSources,
          comparisonByTableName,
          comparisonTableNames,
        },
        initialExpandedState,
      }),
    ),
  };
}

/**
 * Builds a tree node for an Iceberg catalog.
 * Follows the same pattern as buildDatabaseNode but uses catalogAlias instead of dbName
 * and supports the 'credentials-required' connection state.
 */
export function buildIcebergCatalogNode(
  catalog: IcebergCatalog,
  context: DatabaseTreeBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { id: catalogId, catalogAlias } = catalog;
  const {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    initialExpandedState,
    comparisonTableNames,
    comparisonByTableName,
  } = context;

  // Build label with connection state indicator
  const stateIcon =
    catalog.connectionState === 'connected'
      ? '\u2713'
      : catalog.connectionState === 'connecting'
        ? '\u27F3'
        : catalog.connectionState === 'credentials-required'
          ? '\uD83D\uDD12'
          : catalog.connectionState === 'error'
            ? '\u26A0'
            : '\u2715';
  const dbLabel = `${catalogAlias} ${stateIcon}`;

  nodeMap.set(catalogId, { db: catalogId, schemaName: null, objectName: null, columnName: null });
  anyNodeIdToNodeTypeMap.set(catalogId, 'db');

  const metadata = databaseMetadata.get(catalogAlias);
  const sortedSchemas = metadata
    ? [...metadata.schemas].sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Base context menu items
  const baseContextMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [
    {
      label: 'Copy name',
      onClick: () => {
        copyToClipboard(catalogAlias, { showNotification: true });
      },
    },
    {
      label: 'Show Schema',
      onClick: () => {
        const firstSchema = sortedSchemas?.[0];
        getOrCreateSchemaBrowserTab({
          sourceId: catalogId,
          sourceType: 'db',
          schemaName: firstSchema?.name,
          setActive: true,
        });
      },
    },
  ];

  // Iceberg-specific menu items
  const icebergMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [];

  if (catalog.connectionState === 'connected' && catalog.endpoint) {
    icebergMenuItems.push({
      label: 'Copy Endpoint',
      onClick: () => {
        copyToClipboard(catalog.endpoint, {
          showNotification: true,
          notificationTitle: 'Endpoint Copied',
        });
      },
    });
  }

  if (catalog.connectionState === 'connected') {
    icebergMenuItems.push({
      label: 'Refresh',
      onClick: async () => {
        await refreshDatabaseMetadata(conn, [catalogAlias]);
      },
    });
    icebergMenuItems.push({
      label: 'Disconnect',
      onClick: async () => {
        await disconnectIcebergCatalog(conn, catalog);
      },
    });
  }

  // For non-connected states, provide a "Reconnect" action.
  // Opens the reconnect modal via a store action.
  if (catalog.connectionState !== 'connected' && catalog.connectionState !== 'connecting') {
    icebergMenuItems.push({
      label: 'Reconnect',
      onClick: () => {
        useAppStore.setState(
          { icebergReconnectCatalogId: catalog.id },
          false,
          'IcebergCatalog/requestReconnect',
        );
      },
    });
  }

  return {
    nodeType: 'db',
    value: catalogId,
    label: dbLabel,
    iconType: 'db',
    isDisabled: false,
    isSelectable: true,
    onDelete: (node: TreeNodeData<DataExplorerNodeTypeMap>): void => {
      if (node.nodeType === 'db') {
        deleteDataSources(conn, [node.value]);
      }
    },
    contextMenu: [
      {
        children: [...baseContextMenuItems, ...icebergMenuItems],
      },
    ],
    children: sortedSchemas?.map((schema) =>
      buildSchemaTreeNode({
        nodeDbId: catalogId,
        sourceDbId: catalogId,
        dbName: catalogAlias,
        schema,
        context: {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          flatFileSources: context.flatFileSources,
          comparisonByTableName,
          comparisonTableNames,
        },
        initialExpandedState,
      }),
    ),
  };
}

/**
 * Builds a tree node for a MotherDuck connection.
 * Shows as a top-level node with MotherDuck databases as children.
 * Each child database is a full database node with schemas/tables.
 */
export function buildMotherDuckConnectionNode(
  connection: MotherDuckConnection,
  context: DatabaseTreeBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { id: connectionId } = connection;
  const {
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    initialExpandedState,
    comparisonTableNames,
    comparisonByTableName,
  } = context;

  // Build label with connection state indicator
  const stateIcon =
    connection.connectionState === 'connected'
      ? '\u2713'
      : connection.connectionState === 'connecting'
        ? '\u27F3'
        : connection.connectionState === 'credentials-required'
          ? '\uD83D\uDD12'
          : connection.connectionState === 'error'
            ? '\u26A0'
            : '\u2715';
  const dbLabel = `MotherDuck ${stateIcon}`;

  nodeMap.set(connectionId, {
    db: connectionId,
    schemaName: null,
    objectName: null,
    columnName: null,
  });
  anyNodeIdToNodeTypeMap.set(connectionId, 'db');

  // MotherDuck database metadata is stored with "md:" prefixed keys (e.g. "md:my_db")
  // to avoid collisions with local databases. The plain name is used for SQL queries.
  const childNodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [];

  if (connection.connectionState === 'connected') {
    for (const [dbName, dbModel] of databaseMetadata) {
      // MotherDuck databases are stored with "md:" prefix (skip bare "md:")
      if (!dbName.startsWith('md:') || dbName === 'md:') continue;

      // Display name without the "md:" prefix
      const displayName = dbName.slice(3);
      // Use a connection-and-database scoped ID to avoid collisions across MD databases
      const dbNodeId = `${connectionId}::${displayName}` as any;

      const sortedSchemas = dbModel.schemas
        ? [...dbModel.schemas].sort((a, b) => a.name.localeCompare(b.name))
        : [];

      nodeMap.set(dbNodeId, {
        db: connectionId,
        databaseName: displayName,
        schemaName: null,
        objectName: null,
        columnName: null,
      });
      anyNodeIdToNodeTypeMap.set(dbNodeId, 'db');

      childNodes.push({
        nodeType: 'db',
        value: dbNodeId,
        label: displayName,
        iconType: 'db',
        isDisabled: false,
        isSelectable: true,
        contextMenu: [
          {
            children: [
              {
                label: 'Copy name',
                onClick: () => {
                  copyToClipboard(displayName, { showNotification: true });
                },
              },
              {
                label: 'Show Schema',
                onClick: () => {
                  const firstSchema = sortedSchemas?.[0];
                  getOrCreateSchemaBrowserTab({
                    sourceId: connectionId,
                    sourceType: 'db',
                    schemaName: firstSchema?.name,
                    databaseName: displayName,
                    setActive: true,
                  });
                },
              },
            ],
          },
        ],
        children: sortedSchemas.map((schema) =>
          buildSchemaTreeNode({
            nodeDbId: dbNodeId,
            sourceDbId: connectionId,
            // Use plain name for SQL queries (DuckDB knows it as 'my_db', not 'md:my_db')
            dbName: displayName,
            schema,
            context: {
              nodeMap,
              anyNodeIdToNodeTypeMap,
              flatFileSources: context.flatFileSources,
              comparisonByTableName,
              comparisonTableNames,
            },
            initialExpandedState,
          }),
        ),
      });
    }
  }

  // Context menu items
  const contextMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [
    {
      label: 'Copy name',
      onClick: () => {
        copyToClipboard('MotherDuck', { showNotification: true });
      },
    },
  ];

  if (connection.connectionState === 'connected') {
    contextMenuItems.push({
      label: 'Refresh',
      onClick: async () => {
        // Re-discover databases from MotherDuck to pick up newly created ones
        const databases = await listMotherDuckDatabases(conn);
        const dbNames = databases.map((db) => db.name);
        if (dbNames.length > 0) {
          const metadata = await getMotherDuckDatabaseModel(conn, dbNames);
          const currentMetadata = useAppStore.getState().databaseMetadata;
          const newMetadata = new Map(currentMetadata);
          // Remove stale MotherDuck entries that no longer exist
          for (const key of currentMetadata.keys()) {
            if (key.startsWith('md:') && key !== 'md:') {
              const plainName = key.slice(3);
              if (!dbNames.includes(plainName)) {
                newMetadata.delete(key);
              }
            }
          }
          for (const [key, model] of metadata) {
            newMetadata.set(key, model);
          }
          useAppStore.setState({ databaseMetadata: newMetadata }, false, 'MotherDuck/refresh');
        }
      },
    });
    contextMenuItems.push({
      label: 'Disconnect',
      onClick: async () => {
        await disconnectMotherDuckConnection(conn, connection);
      },
    });
  }

  if (connection.connectionState !== 'connected' && connection.connectionState !== 'connecting') {
    contextMenuItems.push({
      label: 'Reconnect',
      onClick: () => {
        useAppStore.setState(
          { motherduckReconnectConnectionId: connection.id },
          false,
          'MotherDuck/requestReconnect',
        );
      },
    });
  }

  return {
    nodeType: 'db',
    value: connectionId,
    label: dbLabel,
    iconType: 'db',
    isDisabled: false,
    isSelectable: true,
    onDelete: (node: TreeNodeData<DataExplorerNodeTypeMap>): void => {
      if (node.nodeType === 'db') {
        deleteDataSources(conn, [node.value]);
      }
    },
    contextMenu: [
      {
        children: contextMenuItems,
      },
    ],
    children: childNodes.length > 0 ? childNodes : undefined,
  };
}
