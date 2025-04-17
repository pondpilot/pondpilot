import { useClipboard } from '@mantine/hooks';
import { useShallow } from 'zustand/react/shallow';
import { memo, useMemo } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { useAppStore, useFlatFileDataSourceMap } from '@store/app-store';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import {
  getFlatFileDataSourceIcon,
  getFlatFileDataSourceName,
  getLocalEntryIcon,
} from '@utils/navigation';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { createSQLScript } from '@controllers/sql-script';
import {
  deleteTabByDataSourceId,
  findTabFromFlatFileDataSource,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { deleteDataSources } from '@controllers/data-source';
import { ExplorerTree, TreeNodeData } from '@components/explorer-tree';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { FSExplorerNodeExtraType, FSExplorerNodeTypeToIdTypeMap } from './model';
import { FileSystemExplorerNode } from './file-system-explorer-node';

/**
 * Displays a file system tree for all registered local entities (files & folders)
 * except databases, which are intentionally separated into DB Explorer
 */
export const FileSystemExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();
  const conn = useInitializedDuckDBConnectionPool();

  /**
   * Store access
   */

  // Read oly necessary sources
  const flatFileSources = useFlatFileDataSourceMap();

  // Create a map of all flat file sources by their related file ID
  const dataSourceByFileId: Map<LocalEntryId, AnyFlatFileDataSource> = new Map(
    flatFileSources.values().map((source) => [source.fileSourceId, source]),
  );

  // Filter out what we do not need in this explorer
  const nonAttachedDBEntries = useAppStore(
    useShallow((state) =>
      Array.from(
        state.localEntries
          .values()
          .filter((entry) => entry.kind === 'directory' || dataSourceByFileId.has(entry.id)),
      ),
    ),
  );

  const parentToChildrenEntriesMap = nonAttachedDBEntries.reduce((acc, entry) => {
    if (!acc.has(entry.parentId)) {
      acc.set(entry.parentId, [entry]);
      return acc;
    }

    acc.get(entry.parentId)!.push(entry);
    return acc;
  }, new Map<LocalEntryId | null, LocalEntry[]>());

  // We have to store a mapping of all node IDs back to their types,
  // that are later used to disambiguate the node type in `hadnleDeleteSelected`
  // callback. It is built together with the tree.
  const anyNodeIdToNodeTypeMap = new Map<
    LocalEntryId | PersistentDataSourceId,
    { nodeType: keyof FSExplorerNodeTypeToIdTypeMap; userAdded: boolean }
  >();

  /**
   * Calculate views to display by doing a depth-first traversal of the entries tree
   */
  const fileSystemTree = useMemo(() => {
    const buildTree = (
      parentId: LocalEntryId | null,
    ): TreeNodeData<FSExplorerNodeTypeToIdTypeMap>[] => {
      const fileTreeChildren: TreeNodeData<FSExplorerNodeTypeToIdTypeMap>[] = [];

      const children = parentToChildrenEntriesMap.get(parentId) || [];

      // Sort (folders first, then alphabetically)
      children.sort((a, b) => {
        const aIsFolder = a.kind === 'directory';
        const bIsFolder = b.kind === 'directory';
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.uniqueAlias.localeCompare(b.uniqueAlias);
      });

      children.forEach((entry) => {
        if (entry.kind === 'directory') {
          anyNodeIdToNodeTypeMap.set(entry.id, { nodeType: 'folder', userAdded: entry.userAdded });

          fileTreeChildren.push({
            nodeType: 'folder',
            value: entry.id,
            label:
              entry.name === entry.uniqueAlias
                ? entry.name
                : `${entry.name} (${entry.uniqueAlias})`,
            iconType: getLocalEntryIcon(entry),
            isDisabled: false,
            isSelectable: false,
            onDelete: entry.userAdded
              ? () => deleteLocalFileOrFolders(conn, [entry.id])
              : undefined,
            contextMenu: [
              {
                children: [
                  {
                    label: 'Copy name',
                    onClick: () => {
                      copy(entry.uniqueAlias);
                      showSuccess({ title: 'Copied', message: '', autoClose: 800 });
                    },
                  },
                ],
              },
            ],
            children: buildTree(entry.id),
          });
          return;
        }

        const relatedSource = dataSourceByFileId.get(entry.id);

        if (!relatedSource) {
          // We skip attached DBs as they are filtered out
          return;
        }

        const label = getFlatFileDataSourceName(relatedSource, entry);
        const iconType = getFlatFileDataSourceIcon(relatedSource);
        const value = relatedSource.id;
        const fqn = `main.${toDuckDBIdentifier(relatedSource.viewName)}`;

        const fileNode: TreeNodeData<FSExplorerNodeTypeToIdTypeMap> = {
          nodeType: 'file',
          value,
          label,
          iconType,
          isDisabled: false,
          isSelectable: true,
          renameCallbacks: {
            validateRename: () => {
              throw new Error('TODO: implement renaming of views for flat files');
            },
            onRenameSubmit: () => {
              throw new Error('TODO: implement renaming of views for flat files');
            },
          },
          onDelete: entry.userAdded
            ? // Only allow deleting explicitly user-added files
              () => {
                deleteDataSources(conn, [value]);
              }
            : undefined,
          onNodeClick: (): void => {
            // Check if the tab is already open
            const existingTab = findTabFromFlatFileDataSource(relatedSource.id);
            if (existingTab) {
              // If the tab is already open, just set as active and do not change preview
              setActiveTabId(existingTab.id);
              return;
            }

            // Net new. Create an active tab
            const tab = getOrCreateTabFromFlatFileDataSource(relatedSource.id, true);
            // Then set as & preview
            setPreviewTabId(tab.id);
          },
          onCloseItemClick: (): void => {
            deleteTabByDataSourceId(relatedSource.id);
          },
          contextMenu: [
            {
              children: [
                {
                  label: 'Copy Full Name',
                  onClick: () => {
                    copy(fqn);
                    showSuccess({ title: 'Copied', message: '', autoClose: 800 });
                  },
                  onAlt: {
                    label: 'Copy Name',
                    onClick: () => {
                      copy(toDuckDBIdentifier(relatedSource.viewName));
                      showSuccess({ title: 'Copied', message: '', autoClose: 800 });
                    },
                  },
                },
                {
                  label: 'Create a Query',
                  onClick: () => {
                    const query = `SELECT * FROM ${fqn};`;

                    const newScript = createSQLScript(`${relatedSource.viewName}_query`, query);
                    getOrCreateTabFromScript(newScript, true);
                  },
                },
              ],
            },
          ],
        };

        anyNodeIdToNodeTypeMap.set(fileNode.value, {
          nodeType: 'file',
          userAdded: entry.userAdded,
        });
        fileTreeChildren.push(fileNode);
      });

      return fileTreeChildren;
    };

    return buildTree(null);
  }, [nonAttachedDBEntries, dataSourceByFileId]);

  /**
   * Consts
   */

  // We currently do not have any extra data to pass to the tree,
  // but highly likely we will need it in the future, hence this placeholder
  const unusedExtraData = useMemo(
    () => new Map<PersistentDataSourceId | LocalEntryId, FSExplorerNodeExtraType>(),
    [],
  );

  const handleDeleteSelected = async (ids: Iterable<LocalEntryId | PersistentDataSourceId>) => {
    // Split the ids into files and folders (different id types, differet delete methods).
    // We also doing a double check here to make sure we are not deleting
    // non user-added elements. Theoretically, these should not end up here,
    // but just in case.
    const files: PersistentDataSourceId[] = [];
    const folders: LocalEntryId[] = [];
    for (const id of ids) {
      const { nodeType, userAdded } = anyNodeIdToNodeTypeMap.get(id) || {
        nodeType: undefined,
        userAdded: false,
      };

      if (!nodeType) {
        // This must be a bug
        console.error(
          `Node type for id "${id}" is missing from a node type mapping in \`handleDeleteSelected\``,
        );
        continue;
      }

      if (!userAdded) {
        // This is not a user-added element, skip
        continue;
      }

      if (nodeType === 'file') {
        files.push(id as PersistentDataSourceId);
      } else {
        folders.push(id as LocalEntryId);
      }
    }

    // Delete the files first, although as of today, files & folders can't
    // overlap, as all files inside folders should be marked as not user-added
    if (files.length > 0) {
      // Delete the files
      deleteDataSources(conn, files);
    }

    if (folders.length > 0) {
      // Delete the folders
      deleteLocalFileOrFolders(conn, folders);
    }
  };

  return (
    <ExplorerTree<FSExplorerNodeTypeToIdTypeMap, FSExplorerNodeExtraType>
      nodes={fileSystemTree}
      // Expand nothing by default
      initialExpandedState={{}}
      extraData={unusedExtraData}
      dataTestIdPrefix="file-system-explorer"
      TreeNodeComponent={FileSystemExplorerNode}
      onDeleteSelected={handleDeleteSelected}
    />
  );
});
