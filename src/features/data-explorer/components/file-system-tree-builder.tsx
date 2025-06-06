import { TreeNodeData } from '@components/explorer-tree';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyFlatFileDataSource, XlsxSheetView } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { useMemo } from 'react';

import { buildFileNode, buildFolderNode, buildXlsxFileNode } from '../builders';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';

interface FileSystemTreeBuilderProps {
  conn: AsyncDuckDBConnectionPool;
  allLocalEntries: LocalEntry[];
  flatFileSourcesValues: AnyFlatFileDataSource[];
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
}

/**
 * Component responsible for building the file system tree structure
 * Handles folders, regular files, and XLSX files with sheets
 */
export function useFileSystemTreeBuilder({
  conn,
  allLocalEntries,
  flatFileSourcesValues,
  nodeMap,
  anyNodeIdToNodeTypeMap,
}: FileSystemTreeBuilderProps): TreeNodeData<DataExplorerNodeTypeMap>[] {
  // Create maps for efficient lookups
  const dataSourceByFileId = useMemo(
    () => new Map(flatFileSourcesValues.map((source) => [source.fileSourceId, source])),
    [flatFileSourcesValues],
  );

  const xlsxSheetsByFileId = useMemo(() => {
    const map = new Map<LocalEntryId, XlsxSheetView[]>();
    flatFileSourcesValues.forEach((source) => {
      if (source.type === 'xlsx-sheet') {
        const sheets = map.get(source.fileSourceId) || [];
        sheets.push(source);
        map.set(source.fileSourceId, sheets);
      }
    });
    return map;
  }, [flatFileSourcesValues]);

  // Build parent-to-children map
  const parentToChildrenMap = useMemo(() => {
    const map = new Map<LocalEntryId | null, LocalEntry[]>();
    allLocalEntries.forEach((entry) => {
      const children = map.get(entry.parentId) || [];
      children.push(entry);
      map.set(entry.parentId, children);
    });
    // Sort children (folders first, then alphabetically)
    map.forEach((children) => {
      children.sort((a, b) => {
        const aIsFolder = a.kind === 'directory';
        const bIsFolder = b.kind === 'directory';
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.uniqueAlias.localeCompare(b.uniqueAlias);
      });
    });
    return map;
  }, [allLocalEntries]);

  // Recursively build file tree from parent ID
  const buildFileTreeFromParentId = (
    parentId: LocalEntryId | null,
  ): TreeNodeData<DataExplorerNodeTypeMap>[] => {
    const fileTreeChildren: TreeNodeData<DataExplorerNodeTypeMap>[] = [];
    const entries = parentToChildrenMap.get(parentId) || [];

    entries.forEach((entry) => {
      // Handle folders
      if (entry.kind === 'directory') {
        const folderNode = buildFolderNode(
          entry,
          {
            nodeMap,
            anyNodeIdToNodeTypeMap,
            conn,
            dataSourceByFileId,
            flatFileSourcesValues,
            nonLocalDBFileEntries: allLocalEntries,
            xlsxSheetsByFileId,
          },
          () => buildFileTreeFromParentId(entry.id),
        );
        fileTreeChildren.push(folderNode);
        return;
      }

      // Handle XLSX files
      if (xlsxSheetsByFileId.has(entry.id)) {
        const relatedSource = dataSourceByFileId.get(entry.id);
        if (!relatedSource) return;

        const sheets = xlsxSheetsByFileId.get(entry.id)!;
        const xlsxNode = buildXlsxFileNode(entry, relatedSource, sheets, {
          nodeMap,
          anyNodeIdToNodeTypeMap,
          conn,
          dataSourceByFileId,
          flatFileSourcesValues,
          nonLocalDBFileEntries: allLocalEntries,
          xlsxSheetsByFileId,
        });
        fileTreeChildren.push(xlsxNode);
        return;
      }

      // Handle regular files
      const relatedSource = dataSourceByFileId.get(entry.id);
      if (!relatedSource) {
        // Skip attached DBs as they are filtered out
        return;
      }

      const fileNode = buildFileNode(entry, relatedSource, {
        nodeMap,
        anyNodeIdToNodeTypeMap,
        conn,
        dataSourceByFileId,
        flatFileSourcesValues,
        nonLocalDBFileEntries: allLocalEntries,
        xlsxSheetsByFileId,
      });
      fileTreeChildren.push(fileNode);
    });

    return fileTreeChildren;
  };

  return useMemo(
    () => buildFileTreeFromParentId(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parentToChildrenMap, dataSourceByFileId, xlsxSheetsByFileId],
  );
}
