import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { MotherDuckConnection } from '@models/data-source';
import { useMemo } from 'react';

import { buildMotherDuckConnectionNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseMotherDuckNodesProps = {
  motherduckConnections: MotherDuckConnection[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
  comparisonTableNames: Set<string>;
  comparisonByTableName: Map<string, Comparison>;
};

export const useMotherDuckNodes = ({
  motherduckConnections,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
  comparisonTableNames,
  comparisonByTableName,
}: UseMotherDuckNodesProps) => {
  return useMemo(
    () =>
      motherduckConnections.map((connection) =>
        buildMotherDuckConnectionNode(connection, {
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
    [
      motherduckConnections,
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      databaseMetadata,
      initialExpandedState,
      flatFileSources,
      comparisonTableNames,
      comparisonByTableName,
    ],
  );
};
