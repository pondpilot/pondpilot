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
        // For files, we need to find the corresponding data source by entry ID
        for (const [dsId, ds] of context.flatFileSources) {
          if (ds.fileSourceId === nodeInfo.entryId && ds.type !== 'xlsx-sheet') {
            deletableDataSourceIds.push(dsId);
            break;
          }
        }
      } else if (nodeType === 'sheet' && nodeInfo.isSheet && nodeInfo.sheetName) {
        // For XLSX sheets, find the specific sheet data source
        for (const [dsId, ds] of context.flatFileSources) {
          if (
            ds.fileSourceId === nodeInfo.entryId &&
            ds.type === 'xlsx-sheet' &&
            'sheetName' in ds &&
            ds.sheetName === nodeInfo.sheetName
          ) {
            deletableDataSourceIds.push(dsId);
            break;
          }
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

  // Filter nodeIds to only include valid ones
  const validNodeIds = nodeIds.filter((id) => {
    const nodeType = anyNodeIdToNodeTypeMap.get(id);
    const nodeInfo = nodeMap.get(id);
    return nodeType !== undefined && nodeInfo !== undefined;
  });

  // Get the node info for all selected nodes
  const selectedNodesInfo = validNodeIds
    .map((id) => ({ id, info: nodeMap.get(id), type: anyNodeIdToNodeTypeMap.get(id) }))
    .filter((item) => item.info !== undefined && item.type !== undefined);

  if (selectedNodesInfo.length === 0) return;

  // Separate database and file nodes
  const dbNodes = selectedNodesInfo.filter((item) => item.info && 'db' in item.info);
  const fileNodes = selectedNodesInfo.filter(
    (item) =>
      item.info && 'entryId' in item.info && (item.type === 'file' || item.type === 'sheet'),
  );
  const folderNodes = selectedNodesInfo.filter(
    (item) => item.info && 'entryId' in item.info && item.type === 'folder',
  );

  // For database nodes, filter to only include object nodes (tables/views)
  const dbObjectNodes = dbNodes.filter((item) => item.type === 'object');

  // Can't mix database and file/folder nodes
  if (dbNodes.length > 0 && (fileNodes.length > 0 || folderNodes.length > 0)) {
    showWarning({
      title: 'Mixed Selection',
      message: 'Cannot show schema for mixed database and file selections',
    });
    return;
  }

  // Handle database nodes
  if (dbObjectNodes.length > 0) {
    const firstNodeInfo = dbObjectNodes[0].info;
    if (!firstNodeInfo || !isDBNodeInfo(firstNodeInfo)) {
      return;
    }

    const sameSchemaNodes = dbObjectNodes.every(
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

    const objectNames = dbObjectNodes
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
    const sourceIds: PersistentDataSourceId[] = [];

    fileNodes.forEach((item) => {
      if (item.type === 'file' && item.info && 'entryId' in item.info) {
        // For regular files, we need to find the data source by entry ID
        const { entryId } = item.info;
        // Find the data source that matches this entry
        for (const [dsId, ds] of flatFileSources) {
          if (ds.fileSourceId === entryId && ds.type !== 'xlsx-sheet') {
            sourceIds.push(dsId);
            break;
          }
        }
      } else if (
        item.type === 'sheet' &&
        item.info &&
        'entryId' in item.info &&
        item.info.isSheet &&
        item.info.sheetName
      ) {
        // For XLSX sheets, we need to find the data source
        // Find the data source that matches this sheet
        for (const [dsId, ds] of flatFileSources) {
          if (
            ds.fileSourceId === item.info.entryId &&
            ds.type === 'xlsx-sheet' &&
            'sheetName' in ds &&
            ds.sheetName === item.info.sheetName
          ) {
            sourceIds.push(dsId);
            break;
          }
        }
      }
    });

    if (sourceIds.length > 0) {
      getOrCreateSchemaBrowserTab({
        sourceId: null,
        sourceType: 'file',
        objectNames: sourceIds,
        setActive: true,
      });
    }
  }

  // Handle folder nodes
  if (folderNodes.length > 0) {
    // For now, we'll handle single folder selection
    // Multiple folder selection could be supported in the future
    if (folderNodes.length === 1) {
      const folderInfo = folderNodes[0].info;
      if (folderInfo && 'entryId' in folderInfo && folderInfo.entryId) {
        getOrCreateSchemaBrowserTab({
          sourceId: folderInfo.entryId,
          sourceType: 'folder',
          setActive: true,
        });
      }
    } else {
      showWarning({
        title: 'Multiple Folders',
        message: 'Schema browser for multiple folders is not yet supported',
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
  // Filter to only include nodes of appropriate types for schema viewing
  const validNodeTypes = ['object', 'file', 'sheet', 'folder'];
  const validNodes = selectedNodes.filter((node) => node && validNodeTypes.includes(node.nodeType));

  // If we have at least one valid node, show the handler
  return validNodes.length > 0
    ? (nodeIds: string[]) => handleMultiSelectShowSchema(nodeIds, context)
    : undefined;
}
