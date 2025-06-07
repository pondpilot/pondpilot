import { TreeNodeData } from '@components/explorer-tree';

import { DataExplorerFilterType, FileTypeFilter } from '../components/data-explorer-filters';
import { DataExplorerNodeTypeMap } from '../model';
import { fuzzyMatch } from './fuzzy-search';

/**
 * Recursively filters tree nodes based on the active filter type, file type filters, and search query
 * Preserves folder structure when filtering files
 *
 * @param nodes - Tree nodes to filter
 * @param filterType - Active filter type (all, databases, files, remote)
 * @param fileTypeFilter - Optional file type filter settings
 * @param getFileExtension - Optional function to get file extension from node label
 * @param searchQuery - Optional search query for fuzzy matching
 * @param expandedState - Optional object to track which nodes should be expanded
 */
export function filterTreeNodes(
  nodes: TreeNodeData<DataExplorerNodeTypeMap>[],
  filterType: DataExplorerFilterType,
  fileTypeFilter?: FileTypeFilter,
  getFileExtension?: (node: TreeNodeData<DataExplorerNodeTypeMap>) => string | null,
  searchQuery?: string,
  expandedState?: Record<string, boolean>,
): TreeNodeData<DataExplorerNodeTypeMap>[] {
  // If there's a search query, apply fuzzy search first
  if (searchQuery) {
    return nodes
      .map((node) => {
        const nodeMatchesSearch = fuzzyMatch(searchQuery, node.label);

        if (node.children) {
          // Recursively filter children
          const filteredChildren = filterTreeNodes(
            node.children,
            filterType,
            fileTypeFilter,
            getFileExtension,
            searchQuery,
            expandedState,
          );

          // Include node if it matches search or has matching children
          if (nodeMatchesSearch || filteredChildren.length > 0) {
            // Auto-expand nodes that have matching children
            if (expandedState && filteredChildren.length > 0) {
              expandedState[node.value] = true;
            }
            return { ...node, children: filteredChildren };
          }
          return null;
        }

        // Leaf node - include if it matches search
        return nodeMatchesSearch ? node : null;
      })
      .filter((node): node is TreeNodeData<DataExplorerNodeTypeMap> => node !== null);
  }

  if (filterType === 'all') {
    return nodes;
  }

  return nodes
    .map((node) => {
      // For files filter
      if (filterType === 'files') {
        if (node.nodeType === 'file' || node.nodeType === 'sheet') {
          // Check if file type filter is active and this file should be included
          if (fileTypeFilter && getFileExtension) {
            const ext = getFileExtension(node);
            if (ext && ext in fileTypeFilter && !fileTypeFilter[ext as keyof FileTypeFilter]) {
              return null;
            }
          }
          // Include file/sheet nodes
          return node;
        }
        if (node.nodeType === 'folder' && node.children) {
          // Check if folder has any file descendants
          const filteredChildren = filterTreeNodes(
            node.children,
            filterType,
            fileTypeFilter,
            getFileExtension,
            searchQuery,
            expandedState,
          );
          if (filteredChildren.length > 0) {
            // Include folder if it contains files
            return {
              ...node,
              children: filteredChildren,
            };
          }
        }
        // Skip empty folders and other node types
        return null;
      }

      // For other filters, just return the node as-is
      return node;
    })
    .filter((node): node is TreeNodeData<DataExplorerNodeTypeMap> => node !== null);
}
