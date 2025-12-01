import { ConnectionPool } from '@engines/types';
import { Comparison } from '@models/comparison';
import { LocalDB, RemoteDB } from '@models/data-source';

import { DataExplorerNodeMap } from '../model';
import { useLocalDbNodes } from './use-local-db-nodes';
import { useRemoteDbNodes } from './use-remote-db-nodes';
import { useSystemDbNode } from './use-system-db-node';

type UseBuildNodesProps = {
  systemDatabase: LocalDB | undefined;
  localDatabases: LocalDB[];
  remoteDatabases: RemoteDB[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, any>;
  conn: ConnectionPool;
  localDBLocalEntriesMap: Map<string, any>;
  databaseMetadata: Map<string, any>;
  fileViewNames: Set<string>;
  initialExpandedState: Record<string, boolean>;
  flatFileSources: Map<string, any>;
  comparisonTableNames: Set<string>;
  comparisonByTableName: Map<string, Comparison>;
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
    nodeMap,
    anyNodeIdToNodeTypeMap,
    conn,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    initialExpandedState,
    flatFileSources,
    comparisonTableNames,
    comparisonByTableName,
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
    comparisonTableNames,
    comparisonByTableName,
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
    comparisonTableNames,
    comparisonByTableName,
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
    comparisonTableNames,
    comparisonByTableName,
  });

  return {
    localDbNodes,
    remoteDatabaseNodes,
    systemDbNode,
    systemDbNodeForDisplay,
  };
};
