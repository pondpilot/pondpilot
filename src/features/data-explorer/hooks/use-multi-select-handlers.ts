import { showWarning } from '@components/app-notifications';
import { deleteDataSources } from '@controllers/data-source';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap, isDBNodeInfo } from '../model';

interface MultiSelectHandlersProps {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>;
  allLocalEntries: LocalEntry[];
}

export function useMultiSelectHandlers({
  nodeMap,
  anyNodeIdToNodeTypeMap,
  conn,
  flatFileSources,
  allLocalEntries,
}: MultiSelectHandlersProps) {
  // Handle delete selected for mixed types
  const handleDeleteSelected = async (ids: Iterable<string>) => {
    const dbIds: PersistentDataSourceId[] = [];
    const fileIds: PersistentDataSourceId[] = [];
    const folderIds: string[] = [];

    for (const id of ids) {
      const nodeType = anyNodeIdToNodeTypeMap.get(id);
      const nodeInfo = nodeMap.get(id);

      if (!nodeType || !nodeInfo) {
        console.error(`Node info for id "${id}" is missing`);
        continue;
      }

      // Check if it's a database node
      if (nodeType === 'db' && 'db' in nodeInfo && nodeInfo.db) {
        dbIds.push(nodeInfo.db);
      } else if ('entryId' in nodeInfo && nodeInfo.entryId) {
        // Check if it's a file system node
        const entry = allLocalEntries.find((e) => e.id === nodeInfo.entryId);
        if (!entry?.userAdded) continue;

        if (nodeType === 'folder') {
          folderIds.push(nodeInfo.entryId);
        } else if (nodeType === 'file' || nodeType === 'sheet') {
          // For files and sheets, we need to find the data source
          const dataSource = flatFileSources.get(id as PersistentDataSourceId);
          if (dataSource) {
            fileIds.push(dataSource.id);
          }
        }
      }
    }

    // Delete all types
    if (dbIds.length > 0 || fileIds.length > 0) {
      deleteDataSources(conn, [...dbIds, ...fileIds]);
    }

    if (folderIds.length > 0) {
      deleteLocalFileOrFolders(conn, folderIds as LocalEntryId[]);
    }
  };

  // Handle multi-select show schema
  const handleMultiSelectShowSchema = (nodeIds: string[]) => {
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
  };

  return {
    handleDeleteSelected,
    handleMultiSelectShowSchema,
  };
}
