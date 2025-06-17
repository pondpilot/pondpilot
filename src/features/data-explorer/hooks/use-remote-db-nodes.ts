import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { RemoteDB } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseRemoteDbNodesProps = {
  remoteDatabases: RemoteDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
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
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteDatabases, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
  );
};
