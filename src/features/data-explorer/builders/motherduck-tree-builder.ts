import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { ConnectionPool } from '@engines/types';
import { RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { disconnectRemoteDatabase, reconnectRemoteDatabase } from '@utils/remote-database';
import { isMotherDuckUrl, extractMotherDuckDbName as extractMDName } from '@utils/url-helpers';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import { buildDatabaseNode } from './database-tree-builder';
import { refreshDatabaseMetadata } from '../utils/metadata-refresh';

interface MotherDuckTreeBuilderContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: ConnectionPool;
  databaseMetadata: Map<string, DataBaseModel>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources?: Map<string, any>;
}

/**
 * Detects if a RemoteDB is a MotherDuck instance based on its URL
 */
export function isMotherDuckInstance(db: RemoteDB): boolean {
  return isMotherDuckUrl(db.url);
}

/**
 * Extracts the MotherDuck database name from the URL
 * md:database_name -> database_name
 * Delegates to the shared helper in url-helpers
 */
export function extractMotherDuckDbName(url: string): string {
  return extractMDName(url) || url.slice(3); // Use helper or fallback
}

/**
 * Groups MotherDuck databases by their instance name (credential name)
 */
export function groupMotherDuckDatabases(remoteDatabases: RemoteDB[]): Map<string, RemoteDB[]> {
  const instanceGroups = new Map<string, RemoteDB[]>();
  const otherRemoteDbs: RemoteDB[] = [];

  for (const db of remoteDatabases) {
    if (isMotherDuckInstance(db)) {
      // Group by instanceName (credential name) or use 'default' if not specified
      const instanceKey = db.instanceName || 'default';
      const group = instanceGroups.get(instanceKey) || [];
      group.push(db);
      instanceGroups.set(instanceKey, group);
    } else {
      otherRemoteDbs.push(db);
    }
  }

  // Add other remote databases as a special group
  if (otherRemoteDbs.length > 0) {
    instanceGroups.set('__other__', otherRemoteDbs);
  }

  return instanceGroups;
}

/**
 * Builds a MotherDuck instance node that contains multiple database children
 */
export function buildMotherDuckInstanceNode(
  instanceName: string,
  motherduckDbs: RemoteDB[],
  context: MotherDuckTreeBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> | null {
  if (motherduckDbs.length === 0) {
    return null;
  }

  const { nodeMap, anyNodeIdToNodeTypeMap, conn } = context;

  // Create a synthetic ID for the MotherDuck instance node
  const instanceId = `motherduck-${instanceName}` as PersistentDataSourceId;
  const instanceNodeId = instanceId; // Use directly as the node ID

  // Determine connection state - if any child is connected, show as connected
  const isAnyConnected = motherduckDbs.some((db) => db.connectionState === 'connected');
  const isAnyConnecting = motherduckDbs.some((db) => db.connectionState === 'connecting');
  const isAllError = motherduckDbs.every((db) => db.connectionState === 'error');

  let stateIcon = '✕'; // disconnected
  if (isAnyConnected) {
    stateIcon = '✓';
  } else if (isAnyConnecting) {
    stateIcon = '⟳';
  } else if (isAllError) {
    stateIcon = '⚠';
  }

  // Display the instance name in the label
  const label = `MotherDuck (${instanceName}) ${stateIcon}`;

  // Register the instance node in maps
  nodeMap.set(instanceNodeId, {
    db: instanceNodeId,
    schemaName: null,
    objectName: null,
    columnName: null,
  });
  anyNodeIdToNodeTypeMap.set(instanceNodeId, 'db');

  // Build context menu for the instance
  const contextMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [
    {
      label: 'Copy URL',
      onClick: () => {
        copyToClipboard('md:', {
          showNotification: true,
          notificationTitle: 'MotherDuck URL Copied',
        });
      },
    },
    {
      label: isAnyConnected ? 'Refresh All' : 'Reconnect All',
      onClick: async () => {
        if (isAnyConnected) {
          // Refresh metadata for all connected databases
          const connectedDbNames = motherduckDbs
            .filter((db) => db.connectionState === 'connected')
            .map((db) => db.dbName);
          if (connectedDbNames.length > 0) {
            await refreshDatabaseMetadata(conn, connectedDbNames);
          }
        } else {
          // Attempt to reconnect all databases
          for (const db of motherduckDbs) {
            if (db.connectionState !== 'connected') {
              await reconnectRemoteDatabase(conn, db);
            }
          }
        }
      },
    },
    ...(isAnyConnected
      ? [
          {
            label: 'Disconnect All',
            onClick: async () => {
              for (const db of motherduckDbs) {
                if (db.connectionState === 'connected') {
                  await disconnectRemoteDatabase(conn, db);
                }
              }
            },
          },
        ]
      : []),
  ];

  // Sort databases by name for consistent display
  const sortedDbs = [...motherduckDbs].sort((a, b) => {
    const aName = extractMotherDuckDbName(a.url);
    const bName = extractMotherDuckDbName(b.url);
    return aName.localeCompare(bName);
  });

  // Build child nodes for each database
  const children = sortedDbs.map((db) => {
    // Build the database node but customize it for MotherDuck
    const dbNode = buildDatabaseNode(db, false, {
      nodeMap: context.nodeMap,
      anyNodeIdToNodeTypeMap: context.anyNodeIdToNodeTypeMap,
      conn: context.conn,
      localDatabases: [],
      localDBLocalEntriesMap: new Map(),
      databaseMetadata: context.databaseMetadata,
      fileViewNames: undefined,
      initialExpandedState: context.initialExpandedState,
      flatFileSources: context.flatFileSources,
    });

    // Customize the label to show just the database name without the connection state
    // (since we show it at the instance level)
    const dbName = extractMotherDuckDbName(db.url);
    dbNode.label = dbName;

    // Use a database icon for individual databases
    dbNode.iconType = 'db';

    return dbNode;
  });

  return {
    nodeType: 'db',
    value: instanceNodeId,
    label,
    iconType: 'motherduck', // We'll need to add this icon type
    isDisabled: false,
    isSelectable: true,
    onDelete: () => {
      // Delete all MotherDuck databases
      deleteDataSources(
        conn,
        motherduckDbs.map((db) => db.id),
      );
    },
    contextMenu: [
      {
        children: contextMenuItems,
      },
    ],
    children,
  };
}

/**
 * Builds remote database nodes, with special handling for MotherDuck instances
 */
export function buildRemoteDatabaseNodesWithHierarchy(
  remoteDatabases: RemoteDB[],
  context: MotherDuckTreeBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap>[] {
  const instanceGroups = groupMotherDuckDatabases(remoteDatabases);
  const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [];

  // Process each instance group
  for (const [instanceKey, databases] of instanceGroups) {
    if (instanceKey === '__other__') {
      // Add other remote databases as flat nodes
      for (const db of databases) {
        const dbNode = buildDatabaseNode(db, false, {
          nodeMap: context.nodeMap,
          anyNodeIdToNodeTypeMap: context.anyNodeIdToNodeTypeMap,
          conn: context.conn,
          localDatabases: [],
          localDBLocalEntriesMap: new Map(),
          databaseMetadata: context.databaseMetadata,
          fileViewNames: undefined,
          initialExpandedState: context.initialExpandedState,
          flatFileSources: context.flatFileSources,
        });
        nodes.push(dbNode);
      }
    } else {
      // Add MotherDuck instance node with grouped databases
      const motherduckNode = buildMotherDuckInstanceNode(instanceKey, databases, context);
      if (motherduckNode) {
        nodes.push(motherduckNode);
      }
    }
  }

  return nodes;
}
