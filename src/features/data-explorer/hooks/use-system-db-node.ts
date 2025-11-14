import { TreeNodeData } from '@components/explorer-tree/model';
import { Comparison } from '@models/comparison';
import { LocalDB, SYSTEM_DATABASE_ID } from '@models/data-source';

import { buildDatabaseNode } from '../builders/database-tree-builder';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';

type UseSystemDbNodeProps = {
  systemDatabase: LocalDB | undefined;
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

export const useSystemDbNode = ({
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
}: UseSystemDbNodeProps) => {
  // Build system database node if it exists
  const systemDbNode = systemDatabase
    ? buildDatabaseNode(systemDatabase, true, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        localDatabases: [],
        localDBLocalEntriesMap,
        databaseMetadata,
        fileViewNames,
        initialExpandedState,
        flatFileSources,
        comparisonTableNames,
        comparisonByTableName,
      })
    : null;

  // Ensure system database node is always available for display
  const systemDbNodeForDisplay: TreeNodeData<DataExplorerNodeTypeMap> = systemDbNode || {
    nodeType: 'db' as const,
    value: SYSTEM_DATABASE_ID,
    label: 'PondPilot',
    iconType: 'duck' as const,
    isDisabled: false,
    isSelectable: false,
    contextMenu: [],
    children: [],
  };

  return {
    systemDbNode,
    systemDbNodeForDisplay,
  };
};
