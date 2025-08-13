import { ConnectionPool } from '@engines/types';
import { useIsTauri } from '@hooks/use-is-tauri';
import { RemoteDB } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { buildRemoteDatabaseNodesWithHierarchy } from '../builders/motherduck-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseRemoteDbNodesProps = {
  remoteDatabases: RemoteDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: ConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
};

export const useRemoteDbNodes = ({
  remoteDatabases,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
}: UseRemoteDbNodesProps) => {
  const isTauri = useIsTauri();

  return useMemo(() => {
    // Use hierarchical display for Tauri (supports MotherDuck)
    if (isTauri) {
      return buildRemoteDatabaseNodesWithHierarchy(remoteDatabases, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        databaseMetadata,
        initialExpandedState,
        flatFileSources,
      });
    }

    // Use flat display for web (no MotherDuck support)
    return remoteDatabases.map((db) =>
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
    );
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    remoteDatabases,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    flatFileSources,
    initialExpandedState,
    isTauri,
  ]);
};
