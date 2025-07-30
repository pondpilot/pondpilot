import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { MotherDuckDB } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseMotherDuckNodesProps = {
  motherDuckDatabases: MotherDuckDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
};

export const useMotherDuckNodes = ({
  motherDuckDatabases,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
}: UseMotherDuckNodesProps) => {
  return useMemo(
    () =>
      motherDuckDatabases.map((db) =>
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
    [motherDuckDatabases, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
  );
};