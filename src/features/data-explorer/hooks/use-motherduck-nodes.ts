import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { AnyFlatFileDataSource, MotherDuckConnection } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { useMemo } from 'react';

import { buildMotherDuckConnectionNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';

type UseMotherDuckNodesProps = {
  motherduckConnections: MotherDuckConnection[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  databaseMetadata: Map<string, DataBaseModel>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, AnyFlatFileDataSource>;
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
