import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB, RemoteDB, HTTPServerDB } from '@models/data-source';

import { DataExplorerNodeMap } from '../model';
import { useHttpServerDbNodes } from './use-httpserver-db-nodes';
import { useLocalDbNodes } from './use-local-db-nodes';
import { useRemoteDbNodes } from './use-remote-db-nodes';
import { useSystemDbNode } from './use-system-db-node';

type UseBuildNodesProps = {
  systemDatabase: LocalDB | undefined;
  localDatabases: LocalDB[];
  remoteDatabases: RemoteDB[];
  httpServerDatabases: HTTPServerDB[];
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
    httpServerDatabases,
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

  // Build HTTP server database nodes
  const httpServerDbNodes = useHttpServerDbNodes({
    httpServerDatabases,
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
    httpServerDbNodes,
    systemDbNode,
    systemDbNodeForDisplay,
  };
};
