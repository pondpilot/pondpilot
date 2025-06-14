import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB } from '@models/data-source';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap } from '../model';

type UseLocalDbNodesProps = {
  localDatabases: LocalDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  localDBLocalEntriesMap: Map<string, any>;
  databaseMetadata: Map<string, any>;
  fileViewNames: Set<string>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
};

export const useLocalDbNodes = ({
  localDatabases,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  localDBLocalEntriesMap,
  databaseMetadata,
  fileViewNames,
  initialExpandedState,
  flatFileSources,
}: UseLocalDbNodesProps) => {
  return useMemo(
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
};
