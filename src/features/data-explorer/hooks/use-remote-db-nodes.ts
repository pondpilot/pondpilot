import { ConnectionPool } from '@engines/types';
import { Comparison } from '@models/comparison';
import { RemoteDB } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseRemoteDbNodesProps = {
  remoteDatabases: RemoteDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: ConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
  comparisonTableNames: Set<string>;
  comparisonByTableName: Map<string, Comparison>;
};

export const useRemoteDbNodes = ({
  remoteDatabases,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
  comparisonTableNames,
  comparisonByTableName,
}: UseRemoteDbNodesProps) => {
  return useMemo(
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
          comparisonTableNames,
          comparisonByTableName,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteDatabases, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
    // comparisonTableNames/comparisonByTableName are only used for system DB, so they do not
    // affect remote nodes; omit from dependencies intentionally
  );
};
