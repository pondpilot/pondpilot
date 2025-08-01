import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB, RemoteDB, MotherDuckDB } from '@models/data-source';

import { DataExplorerNodeMap } from '../model';
import { useLocalDbNodes } from './use-local-db-nodes';
import { useMotherDuckNodes } from './use-motherduck-nodes';
import { useRemoteDbNodes } from './use-remote-db-nodes';
import { useSystemDbNode } from './use-system-db-node';

type UseBuildNodesProps = {
  systemDatabase: LocalDB | undefined;
  localDatabases: LocalDB[];
  remoteDatabases: RemoteDB[];
  motherDuckDatabases: MotherDuckDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: AsyncDuckDBConnectionPool;
  localDBLocalEntriesMap: Map<string, any>;
  databaseMetadata: Map<string, any>;
  fileViewNames: Set<string>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
};

/**
 * Composite hook that orchestrates building all types of database nodes
 * by delegating to specialized hooks for each node type
 */
export const useBuildNodes = (props: UseBuildNodesProps) => {
  const {
    systemDatabase,
    localDatabases,
    remoteDatabases,
    motherDuckDatabases,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    initialExpandedState,
    flatFileSources,
  } = props;

  // Build local database nodes
  const localDbNodes = useLocalDbNodes({
    localDatabases,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    initialExpandedState,
    flatFileSources,
  });

  // Build remote database nodes
  const remoteDatabaseNodes = useRemoteDbNodes({
    remoteDatabases,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    initialExpandedState,
    flatFileSources,
  });

  // Build MotherDuck database nodes
  const motherDuckNodes = useMotherDuckNodes({
    motherDuckDatabases,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    databaseMetadata,
    initialExpandedState,
    flatFileSources,
  });

  // Build system database node
  const { systemDbNode, systemDbNodeForDisplay } = useSystemDbNode({
    systemDatabase,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    initialExpandedState,
    flatFileSources,
  });

  return {
    localDbNodes,
    remoteDatabaseNodes,
    motherDuckNodes,
    systemDbNode,
    systemDbNodeForDisplay,
  };
};
