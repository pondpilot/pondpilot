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
        } else if (nodeType === 'file') {
          // For files, we need to find the data source by entry ID
          for (const [dsId, ds] of flatFileSources) {
            if (ds.fileSourceId === nodeInfo.entryId && ds.type !== 'xlsx-sheet') {
              fileIds.push(dsId);
              break;
            }
          }
        } else if (nodeType === 'sheet' && nodeInfo.isSheet && nodeInfo.sheetName) {
          // For XLSX sheets, we need to find the data source
          for (const [dsId, ds] of flatFileSources) {
            if (
              ds.fileSourceId === nodeInfo.entryId &&
              ds.type === 'xlsx-sheet' &&
              'sheetName' in ds &&
              ds.sheetName === nodeInfo.sheetName
            ) {
              fileIds.push(dsId);
              break;
            }
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
      } else if (dbObjectNodes.length === 0) {
        // No object nodes were selected (only columns or other non-object nodes)
        showWarning({
          title: 'No Tables Selected',
          message: 'Please select tables or views to show in the schema browser',
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
  };

  return {
    handleDeleteSelected,
    handleMultiSelectShowSchema,
  };
}
