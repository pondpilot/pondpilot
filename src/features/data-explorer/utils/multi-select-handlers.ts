import { showWarning } from '@components/app-notifications';
import { TreeNodeData } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap, isDBNodeInfo } from '../model';

interface MultiSelectHandlerContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  flatFileSources: Map<PersistentDataSourceId, any>;
}

/**
 * Handles deletion of multiple selected nodes in the data explorer
 * Separates database sources and folders, then deletes them appropriately
 */
export function handleMultiSelectDelete(
  nodes: TreeNodeData<DataExplorerNodeTypeMap>[],
  context: MultiSelectHandlerContext,
): void {
  const { nodeMap, anyNodeIdToNodeTypeMap, conn } = context;

  const deletableDataSourceIds: PersistentDataSourceId[] = [];
  const folderIds: LocalEntryId[] = [];

  nodes.forEach((node) => {
    const nodeInfo = nodeMap.get(node.value);
    const nodeType = anyNodeIdToNodeTypeMap.get(node.value);

    if (!nodeInfo || !nodeType) {
      return;
    }

    // Handle database nodes
    if ('db' in nodeInfo && nodeType === 'db' && nodeInfo.db) {
      deletableDataSourceIds.push(nodeInfo.db);
      return;
    }

    // Handle file nodes
    if ('entryId' in nodeInfo) {
      if (nodeType === 'file' && !nodeInfo.isSheet) {
        // For files, we need to find the corresponding data source
        const dataSourceId = node.value as PersistentDataSourceId;
        if (dataSourceId) {
          deletableDataSourceIds.push(dataSourceId);
        }
      } else if (nodeType === 'folder' && nodeInfo.entryId) {
        folderIds.push(nodeInfo.entryId);
      }
    }
  });

  if (deletableDataSourceIds.length > 0) {
    deleteDataSources(conn, deletableDataSourceIds);
  }

  if (folderIds.length > 0) {
    deleteLocalFileOrFolders(conn, folderIds);
  }
}

/**
 * Handles showing schema for multiple selected nodes
 * Validates that all selected nodes are compatible (all database or all file nodes)
 */
export function handleMultiSelectShowSchema(
  nodeIds: string[],
  context: MultiSelectHandlerContext,
): void {
  const { nodeMap, anyNodeIdToNodeTypeMap, flatFileSources } = context;

  // Get the node info for all selected nodes
  const selectedNodesInfo = nodeIds
    .map((id) => ({ id, info: nodeMap.get(id), type: anyNodeIdToNodeTypeMap.get(id) }))
    .filter((item) => item.info !== undefined && item.type !== undefined);

  if (selectedNodesInfo.length === 0) return;

  // Separate database and file nodes
  const dbNodes = selectedNodesInfo.filter((item) => item.info && 'db' in item.info);
  const fileNodes = selectedNodesInfo.filter((item) => item.info && 'entryId' in item.info);

  // Can't mix database and file nodes
  if (dbNodes.length > 0 && fileNodes.length > 0) {
    showWarning({
      title: 'Mixed Selection',
      message: 'Cannot show schema for mixed database and file selections',
    });
    return;
  }

  // Handle database nodes
  if (dbNodes.length > 0) {
    const firstNodeInfo = dbNodes[0].info;
    if (!firstNodeInfo || !isDBNodeInfo(firstNodeInfo)) {
      return;
    }

    const sameSchemaNodes = dbNodes.every(
      (item) =>
        item.info &&
        isDBNodeInfo(item.info) &&
        item.info.db === firstNodeInfo.db &&
        item.info.schemaName === firstNodeInfo.schemaName,
    );

    if (!sameSchemaNodes) {
      showWarning({
        title: 'Schema Mismatch',
        message: 'All selected items must belong to the same database schema',
      });
      return;
    }

    const objectNames = dbNodes
      .filter((item) => item.info && isDBNodeInfo(item.info) && item.info.objectName !== null)
      .map((item) => {
        const { info } = item;
        if (info && isDBNodeInfo(info) && info.objectName) {
          return info.objectName;
        }
        return null;
      })
      .filter((name): name is string => name !== null);

    if (objectNames.length > 0 && firstNodeInfo.db && firstNodeInfo.schemaName) {
      getOrCreateSchemaBrowserTab({
        sourceId: firstNodeInfo.db,
        sourceType: 'db',
        schemaName: firstNodeInfo.schemaName,
        objectNames,
        setActive: true,
      });
    }
  }

  // Handle file nodes
  if (fileNodes.length > 0) {
    const sourceIds = fileNodes
      .filter((item) => item.type === 'file')
      .map((item) => item.id)
      .filter((id): id is PersistentDataSourceId =>
        flatFileSources.has(id as PersistentDataSourceId),
      );

    if (sourceIds.length > 0) {
      getOrCreateSchemaBrowserTab({
        sourceId: null,
        sourceType: 'file',
        objectNames: sourceIds,
        setActive: true,
      });
    }
  }
}

/**
 * Creates a show schema handler for selected nodes
 * Returns handler function if all nodes are valid for schema viewing
 */
export function getShowSchemaHandler(
  selectedNodes: TreeNodeData<DataExplorerNodeTypeMap>[],
  context: MultiSelectHandlerContext,
): ((nodeIds: string[]) => void) | undefined {
  // Check if all nodes are of appropriate types for schema viewing
  const validNodeTypes = ['object', 'file'];
  const areAllValidNodes = selectedNodes.every(
    (node) => node && validNodeTypes.includes(node.nodeType),
  );

  return areAllValidNodes && selectedNodes.length > 0
    ? (nodeIds: string[]) => handleMultiSelectShowSchema(nodeIds, context)
    : undefined;
}
