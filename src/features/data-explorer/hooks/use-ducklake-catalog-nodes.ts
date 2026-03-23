import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { DuckLakeCatalog } from '@models/data-source';
import { useMemo } from 'react';

import { buildDuckLakeCatalogNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseDuckLakeCatalogNodesProps = {
  duckLakeCatalogs: DuckLakeCatalog[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
  comparisonTableNames: Set<string>;
  comparisonByTableName: Map<string, Comparison>;
};

export const useDuckLakeCatalogNodes = ({
  duckLakeCatalogs,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
  comparisonTableNames,
  comparisonByTableName,
}: UseDuckLakeCatalogNodesProps) => {
  return useMemo(
    () =>
      duckLakeCatalogs.map((catalog) =>
        buildDuckLakeCatalogNode(catalog, {
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
      duckLakeCatalogs,
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
