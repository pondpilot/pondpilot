import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { IcebergCatalog } from '@models/data-source';
import { useMemo } from 'react';

import { buildIcebergCatalogNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseIcebergCatalogNodesProps = {
  icebergCatalogs: IcebergCatalog[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  databaseMetadata: Map<string, any>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
  comparisonTableNames: Set<string>;
  comparisonByTableName: Map<string, Comparison>;
};

export const useIcebergCatalogNodes = ({
  icebergCatalogs,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  databaseMetadata,
  initialExpandedState,
  flatFileSources,
  comparisonTableNames,
  comparisonByTableName,
}: UseIcebergCatalogNodesProps) => {
  return useMemo(
    () =>
      icebergCatalogs.map((catalog) =>
        buildIcebergCatalogNode(catalog, {
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
    [icebergCatalogs, nodeMap, anyNodeIdToNodeTypeMap, conn, databaseMetadata, flatFileSources],
  );
};
