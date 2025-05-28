import { ExplorerTree, TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree';
import { createMultiSelectContextMenu } from '@components/explorer-tree/utils/multi-select-menu';
import { getFlattenNodes } from '@components/explorer-tree/utils/tree-manipulation';
import { deleteDataSources } from '@controllers/data-source';
import { renameFile, renameXlsxFile } from '@controllers/file-explorer';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { createSQLScript } from '@controllers/sql-script';
import {
  deleteTabByDataSourceId,
  findTabFromFlatFileDataSource,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  getOrCreateSchemaBrowserTab,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useHotkeys } from '@mantine/hooks';
import { AnyFlatFileDataSource, PersistentDataSourceId, XlsxSheetView } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { useAppStore, useFlatFileDataSourceMap } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import {
  getFlatFileDataSourceIcon,
  getFlatFileDataSourceName,
  getFolderName,
  getLocalEntryIcon,
  getXlsxFileName,
} from '@utils/navigation';
import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { FileSystemExplorerNode } from './file-system-explorer-node';
import { FSExplorerContext, FSExplorerNodeExtraType, FSExplorerNodeTypeToIdTypeMap } from './model';

/**
 * Displays a file system tree for all registered local entities (files & folders)
 * except databases, which are intentionally separated into DB Explorer
 */
export const FileSystemExplorer = memo(() => {
  /**
   * Common hooks
   */
  const conn = useInitializedDuckDBConnectionPool();

  /**
   * Store access
   */

  // Read only necessary sources
  const flatFileSources = useFlatFileDataSourceMap();
  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'data-source' && activeTab.dataSourceType === 'file';
  });
  const flatFileSourcesValues = useMemo(
    () => Array.from(flatFileSources.values()),
    [flatFileSources],
  );

  // Create a map of all flat file sources by their related file ID
  const dataSourceByFileId: Map<LocalEntryId, AnyFlatFileDataSource> = useMemo(
    () => new Map(flatFileSourcesValues.map((source) => [source.fileSourceId, source])),
    [flatFileSourcesValues],
  );

  // Only non DB file entries
  const nonAttachedDBFileEntries = useAppStore(
    useShallow((state) =>
      Array.from(
        state.localEntries
          .values()
          .filter((entry) => entry.kind === 'file' && entry.ext !== 'duckdb'),
      ),
    ),
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

      // Group XLSX sheets by parent file
      const xlsxSheetsByFileId = new Map<LocalEntryId, XlsxSheetView[]>();
      for (const source of flatFileSourcesValues) {
        if (source.type === 'xlsx-sheet') {
          const fileId = source.fileSourceId; // This is the parent XLSX file's ID
          const sheets = xlsxSheetsByFileId.get(fileId) || [];
          sheets.push(source as XlsxSheetView);
          xlsxSheetsByFileId.set(fileId, sheets);
        }
      }

      children.forEach((entry) => {
        if (entry.kind === 'directory') {
          anyNodeIdToNodeTypeMap.set(entry.id, { nodeType: 'folder', userAdded: entry.userAdded });

          fileTreeChildren.push({
            nodeType: 'folder',
            value: entry.id,
            label: getFolderName(entry),
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
                      copyToClipboard(entry.uniqueAlias, { showNotification: true });
                    },
                  },
                  {
                    label: 'Show Schema',
                    onClick: () => {
                      getOrCreateSchemaBrowserTab({
                        sourceId: entry.id,
                        sourceType: 'folder',
                        setActive: true,
                      });
                    },
                  },
                ],
              },
            ],
            children: buildTree(entry.id),
          });
          return;
        }

        if (entry.ext === 'xlsx' && xlsxSheetsByFileId.has(entry.id)) {
          const relatedSource = dataSourceByFileId.get(entry.id);

          if (!relatedSource) {
            return;
          }

          const validateXlsxFileRename = (
            newName: string,
            fileEntries: Iterable<LocalEntry>,
            thisEntry: LocalEntry,
          ): string | null => {
            newName = newName.trim();

            if (newName.length === 0) {
              return 'Name cannot be empty';
            }

            for (const f of fileEntries) {
              if (f.id !== thisEntry.id && f.uniqueAlias.toLowerCase() === newName.toLowerCase()) {
                return 'Name must be unique';
              }
            }

            return null;
          };

          const onXlsxFileRenameSubmit = (newName: string, thisEntry: LocalEntry): void => {
            newName = newName.trim();
            if (thisEntry.uniqueAlias === newName) {
              // No need to rename if the name has not been changed
              return;
            }
            renameXlsxFile(thisEntry.id, newName, conn);
          };

          const sheets = xlsxSheetsByFileId.get(entry.id)!;

          // Sort sheets alphabetically for consistent display
          sheets.sort((a, b) => a.sheetName.localeCompare(b.sheetName));

          anyNodeIdToNodeTypeMap.set(entry.id, {
            nodeType: 'file',
            userAdded: entry.userAdded,
          });

          // Create a parent node for the XLSX file
          const xlsxNode: TreeNodeData<FSExplorerNodeTypeToIdTypeMap> = {
            nodeType: 'file',
            value: relatedSource.id,
            label: getXlsxFileName(entry),
            iconType: getLocalEntryIcon(entry),
            isDisabled: false,
            isSelectable: false,
            renameCallbacks: {
              prepareRenameValue: () => entry.uniqueAlias,
              validateRename: (_, newName) =>
                validateXlsxFileRename(newName, nonAttachedDBFileEntries, entry),
              onRenameSubmit: (_, newName) => onXlsxFileRenameSubmit(newName, entry),
            },
            onDelete: entry.userAdded
              ? () => deleteLocalFileOrFolders(conn, [entry.id])
              : undefined,
            contextMenu: [
              {
                children: [
                  {
                    label: 'Copy name',
                    onClick: () => {
                      copyToClipboard(entry.uniqueAlias, { showNotification: true });
                    },
                  },
                  {
                    label: 'Show Schema',
                    onClick: () => {
                      getOrCreateSchemaBrowserTab({
                        sourceId: relatedSource.id,
                        sourceType: 'file',
                        setActive: true,
                      });
                    },
                  },
                ],
              },
            ],
            children: sheets.map((sheet) => {
              const sheetLabel = sheet.sheetName;
              const value = sheet.id;
              const fqn = `main.${toDuckDBIdentifier(sheet.viewName)}`;

              const sheetNode: TreeNodeData<FSExplorerNodeTypeToIdTypeMap> = {
                nodeType: 'sheet',
                value,
                label: sheetLabel,
                iconType: 'xlsx-sheet',
                isDisabled: false,
                isSelectable: true,
                onNodeClick: (node: any, tree: any): void => {
                  const existingTab = findTabFromFlatFileDataSource(sheet.id);
                  if (existingTab) {
                    setActiveTabId(existingTab.id);
                    return;
                  }

                  const tab = getOrCreateTabFromFlatFileDataSource(sheet.id, true);
                  setPreviewTabId(tab.id);
                },
                onCloseItemClick: (): void => {
                  deleteTabByDataSourceId(sheet.id);
                },
                contextMenu: [
                  {
                    children: [
                      {
                        label: 'Copy Full Name',
                        onClick: () => {
                          copyToClipboard(fqn, { showNotification: true });
                        },
                        onAlt: {
                          label: 'Copy Name',
                          onClick: () => {
                            copyToClipboard(toDuckDBIdentifier(sheet.viewName), {
                              showNotification: true,
                            });
                          },
                        },
                      },
                      {
                        label: 'Create a Query',
                        onClick: () => {
                          const query = `SELECT * FROM ${fqn};`;
                          const newScript = createSQLScript(`${sheet.sheetName}_query`, query);
                          getOrCreateTabFromScript(newScript, true);
                        },
                      },
                    ],
                  },
                ],
              };

              anyNodeIdToNodeTypeMap.set(sheetNode.value, {
                nodeType: 'sheet',
                userAdded: entry.userAdded,
              });

              return sheetNode;
            }),
          };

          fileTreeChildren.push(xlsxNode);
          return;
        }

        const relatedSource = dataSourceByFileId.get(entry.id);

        if (!relatedSource) {
          // We skip attached DBs as they are filtered out
          return;
        }

        const validateFileRename = (
          node: TreeNodeData<FSExplorerNodeTypeToIdTypeMap>,
          newName: string,
          fileSources: Iterable<AnyFlatFileDataSource>,
        ): string | null => {
          newName = newName.trim();

          if (newName.length === 0) {
            return 'Name cannot be empty';
          }

          for (const f of fileSources) {
            if (f.id !== node.value && f.viewName.toLowerCase() === newName.toLowerCase()) {
              return 'Name must be unique';
            }
          }

          return null;
        };

        const onFileRenameSubmit = (newName: string, fileSource: AnyFlatFileDataSource): void => {
          newName = newName.trim();
          if (fileSource.viewName === newName) {
            // No need to rename if the name has not been changed
            return;
          }
          renameFile(fileSource.id, newName, conn);
        };

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
            prepareRenameValue: () => relatedSource.viewName,
            validateRename: (node, newName) =>
              validateFileRename(node, newName, flatFileSourcesValues),
            onRenameSubmit: (_, newName) => onFileRenameSubmit(newName, relatedSource),
          },
          onDelete: entry.userAdded
            ? // Only allow deleting explicitly user-added files
              () => {
                deleteDataSources(conn, [value]);
              }
            : undefined,
          onNodeClick: (node: any, tree: any): void => {
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
                    copyToClipboard(fqn, { showNotification: true });
                  },
                  onAlt: {
                    label: 'Copy Name',
                    onClick: () => {
                      copyToClipboard(toDuckDBIdentifier(relatedSource.viewName), {
                        showNotification: true,
                      });
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
                {
                  label: 'Show Schema',
                  onClick: () => {
                    getOrCreateSchemaBrowserTab({
                      sourceId: relatedSource.id,
                      sourceType: 'file',
                      setActive: true,
                    });
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
  }, [
    conn,
    dataSourceByFileId,
    nonAttachedDBFileEntries,
    parentToChildrenEntriesMap,
    flatFileSources,
    flatFileSourcesValues,
  ]);

  /**
   * Consts
   */

  // We currently do not have any extra data to pass to the tree,
  // but highly likely we will need it in the future, hence this placeholder
  const unusedExtraData = useMemo(
    () => new Map<PersistentDataSourceId | LocalEntryId, FSExplorerNodeExtraType>(),
    [],
  );

  // Flattened nodes for selection handling
  const flattenedNodes = useMemo(() => getFlattenNodes(fileSystemTree as any), [fileSystemTree]);
  const flattenedNodeIds = useMemo(
    () => flattenedNodes.map((node) => node.value),
    [flattenedNodes],
  );

  const selectedDeleteableNodeIds = useMemo(
    () => flattenedNodes.filter((node) => !!node.onDelete).map((node) => node.value),
    [flattenedNodes],
  ) as (LocalEntryId | PersistentDataSourceId)[];

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

      if (nodeType === 'file' || nodeType === 'sheet') {
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

  // Create a function to get override context menu
  const getOverrideContextMenu = (selectedState: string[]) => {
    // Additional logic for file explorer - only show schema if all nodes are files
    const selectedNodes = selectedState
      .map((nodeId) => flattenedNodes.find((node) => node.value === nodeId))
      .filter(Boolean);

    const areAllFiles = selectedNodes.every((node) => node?.nodeType === 'file');

    const showSchemaHandler =
      areAllFiles && selectedNodes.length > 0
        ? (ids: (LocalEntryId | PersistentDataSourceId)[]) => {
            // Get the source IDs for all selected files
            const sourceIds = ids.filter((id): id is PersistentDataSourceId =>
              flatFileSources.has(id as PersistentDataSourceId),
            );

            if (sourceIds.length > 0) {
              // For multiple files, we'll use the objectNames field to store the source IDs
              getOrCreateSchemaBrowserTab({
                sourceId: null,
                sourceType: 'file',
                objectNames: sourceIds,
                setActive: true,
              });
            }
          }
        : undefined;

    return createMultiSelectContextMenu(selectedState, flattenedNodes, {
      onDeleteSelected: handleDeleteSelected,
      onShowSchemaSelected: showSchemaHandler,
    }) as TreeNodeMenuType<TreeNodeData<FSExplorerNodeTypeToIdTypeMap>> | null;
  };

  const enhancedExtraData: FSExplorerContext = Object.assign(unusedExtraData, {
    getOverrideContextMenu,
    flattenedNodeIds,
    selectedDeleteableNodeIds,
  });

  // Hotkeys for deletion
  useHotkeys([
    [
      'mod+Backspace',
      () => {
        if (selectedDeleteableNodeIds.length === 0) {
          return;
        }
        handleDeleteSelected(selectedDeleteableNodeIds);
      },
    ],
  ]);

  return (
    <ExplorerTree<FSExplorerNodeTypeToIdTypeMap, FSExplorerContext>
      nodes={fileSystemTree}
      // Expand nothing by default
      initialExpandedState={{}}
      extraData={enhancedExtraData}
      dataTestIdPrefix="file-system-explorer"
      TreeNodeComponent={FileSystemExplorerNode}
      hasActiveElement={hasActiveElement}
    />
  );
});
