import { TreeNodeData } from '@components/explorer-tree';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { LocalDB, RemoteDB } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { LocalEntry } from '@models/file-system';
import { useMemo } from 'react';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeTypeMap, DataExplorerNodeMap } from '../model';

interface DatabaseSectionProps {
  systemDatabase?: LocalDB;
  localDatabases: LocalDB[];
  remoteDatabases: RemoteDB[];
  localDBLocalEntriesMap: Map<string, LocalEntry>;
  databaseMetadata: Map<string, DataBaseModel>;
  fileViewNames: Set<string>;
  conn: AsyncDuckDBConnectionPool;
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  initialExpandedState: Record<string, boolean>;
}

/**
 * Database section component that builds and organizes database nodes for the data explorer
 *
 * This component handles the creation of tree nodes for all database types:
 * - System database (PondPilot) with special duck icon and handling
 * - Local databases from attached .duckdb files
 * - Remote databases connected via HTTPS, S3, GCS, or Azure
 *
 * Features:
 * - Automatically prioritizes system database first
 * - Uses existing database tree builders for consistent functionality
 * - Memoized for performance with large numbers of databases
 * - Integrates with the unified data explorer context system
 *
 * The component returns raw tree node data that gets rendered by the ExplorerTree
 * component with appropriate styling and interaction handlers.
 */
export const DatabaseSection = ({
  systemDatabase,
  localDatabases,
  remoteDatabases,
  localDBLocalEntriesMap,
  databaseMetadata,
  fileViewNames,
  conn,
  nodeMap,
  anyNodeIdToNodeTypeMap,
  initialExpandedState,
}: DatabaseSectionProps) => {
  const databaseNodes = useMemo(() => {
    const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [];

    const context = {
      nodeMap,
      anyNodeIdToNodeTypeMap,
      conn,
      localDatabases,
      localDBLocalEntriesMap,
      databaseMetadata,
      fileViewNames,
      initialExpandedState,
    };

    // Always add system database first if it exists
    if (systemDatabase) {
      const systemDbNode = buildDatabaseNode(systemDatabase, true, context);
      nodes.push(systemDbNode);
    }

    // Add local databases
    for (const localDb of localDatabases) {
      const localDbNode = buildDatabaseNode(localDb, false, context);
      nodes.push(localDbNode);
    }

    // Add remote databases
    for (const remoteDb of remoteDatabases) {
      const remoteDbNode = buildDatabaseNode(remoteDb, false, context);
      nodes.push(remoteDbNode);
    }

    return nodes;
  }, [
    systemDatabase,
    localDatabases,
    remoteDatabases,
    localDBLocalEntriesMap,
    databaseMetadata,
    fileViewNames,
    conn,
    nodeMap,
    anyNodeIdToNodeTypeMap,
    initialExpandedState,
  ]);

  return databaseNodes;
};

DatabaseSection.displayName = 'DatabaseSection';
