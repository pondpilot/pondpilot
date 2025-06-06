import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB, RemoteDB, SYSTEM_DATABASE_ID } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseBuildNodesProps = {
  systemDatabase: LocalDB | undefined;
  localDatabases: LocalDB[];
  remoteDatabases: RemoteDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  localDBLocalEntriesMap: Map<string, any>;
  databaseMetadata: Map<string, any>;
  fileViewNames: Set<string>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
};

export const useBuildNodes = ({
  systemDatabase,
  localDatabases,
  remoteDatabases,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  localDBLocalEntriesMap,
  databaseMetadata,
  fileViewNames,
  initialExpandedState,
  flatFileSources,
}: UseBuildNodesProps) => {
  // Build local database nodes
  const localDbNodes = useMemo(
    () =>
      localDatabases.map((db) =>
        buildDatabaseNode(db, false, {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          conn,
          localDatabases,
          localDBLocalEntriesMap,
          databaseMetadata,
          fileViewNames,
          initialExpandedState,
          flatFileSources,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      localDatabases,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      localDBLocalEntriesMap,
      databaseMetadata,
      fileViewNames,
      flatFileSources,
    ],
  );

  // Build remote database nodes
  const remoteDatabaseNodes = useMemo(
    () =>
      remoteDatabases.map((db) =>
        buildDatabaseNode(db, false, {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          conn,
          localDatabases: [],
          localDBLocalEntriesMap: new Map(),
          databaseMetadata,
          initialExpandedState,
          flatFileSources,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteDatabases, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
  );

  // Build system database node if it exists
  const systemDbNode = systemDatabase
    ? buildDatabaseNode(systemDatabase, true, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        localDatabases: [],
        localDBLocalEntriesMap,
        databaseMetadata,
        fileViewNames,
        initialExpandedState,
        flatFileSources,
      })
    : null;

  // Ensure system database node is always available for display
  const systemDbNodeForDisplay = systemDbNode || {
    nodeType: 'db' as const,
    value: SYSTEM_DATABASE_ID,
    label: 'PondPilot',
    iconType: 'duck' as const,
    isDisabled: false,
    isSelectable: false,
    contextMenu: [],
    children: [],
  };

  return {
    localDbNodes,
    remoteDatabaseNodes,
    systemDbNode,
    systemDbNodeForDisplay,
  };
};
