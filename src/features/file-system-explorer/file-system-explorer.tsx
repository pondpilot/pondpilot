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
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
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
  const conn = useInitializedDuckDBConnection();

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

  const paretToChildrenEntiresMap = nonAttachedDBEntries.reduce((acc, entry) => {
    if (!acc.has(entry.parentId)) {
      acc.set(entry.parentId, [entry]);
      return acc;
    }

    acc.get(entry.parentId)!.push(entry);
    return acc;
  }, new Map<LocalEntryId | null, LocalEntry[]>());

  /**
   * Calculate views to display by doing a depth-first traversal of the entries tree
   */
  const fileSystemTree = useMemo(() => {
    const buildTree = (
      parentId: LocalEntryId | null,
    ): TreeNodeData<FSExplorerNodeTypeToIdTypeMap>[] => {
      const fileTreeChildren: TreeNodeData<FSExplorerNodeTypeToIdTypeMap>[] = [];

      const children = paretToChildrenEntiresMap.get(parentId) || [];

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
              ? (_: TreeNodeData<FSExplorerNodeTypeToIdTypeMap>): void => {
                  throw new Error('TODO: implement delete for folders');
                }
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
              throw new Error('TODO: implement renaming of database aliases');
            },
            onRenameSubmit: () => {
              throw new Error('TODO: implement renaming of database aliases');
            },
          },
          onDelete: entry.userAdded
            ? // Only allow deleting explicitly user-added files
              (node: TreeNodeData<FSExplorerNodeTypeToIdTypeMap>): void => {
                if (node.nodeType === 'file') {
                  deleteDataSources(conn, [node.value]);
                }
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
    // TODO: this is not a full implementation as we may have
    // different nodes (folders, files and sheets)
    deleteDataSources(conn, ids);
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
