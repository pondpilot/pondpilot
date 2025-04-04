import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { useAppContext, useDataSourcesActions } from '@features/app-context';
import { useAppStore } from '@store/app-store';
import { useClipboard } from '@mantine/hooks';
import { memo, useCallback } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import {
  useAllTabsQuery,
  useCreateQueryFileMutation,
  useDeleteTabsMutatuion,
} from '@store/app-idb-store';
import { useInitStore } from '@store/init-store';

/**
 * Displays a file system tree for all registered local entities (files & folders)
 * except databases, which are intentionally separated into DB Explorer
 */
export const FileSystemExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { onDeleteDataSource } = useDataSourcesActions();
  const { openTab } = useAppContext();
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();
  const { mutateAsync: deleteTabs } = useDeleteTabsMutatuion();

  /**
   * Store access
   */
  const views = useAppStore((state) => state.views);
  const appLoadState = useInitStore.use.appLoadState();
  const { data: tabs = [] } = useAllTabsQuery();

  const activeTab = tabs.find((tab) => tab.active);
  const localEntries = useInitStore.use.localEntries();
  const dataSources = useInitStore.use.dataSources();

  /**
   * Calculate views to display by doing a depth-first traversal of the entries tree
   */
  const buildEntryTree = useCallback(() => {
    const result: Array<{
      value: string;
      label: string;
      nodeProps: { canSelect: boolean; id: string; isFolder?: boolean };
      children?: any[];
    }> = [];

    // Set to track visited nodes to avoid circular references
    const visited = new Set<string>();

    // Recursive depth-first function to build tree
    const traverseEntries = (nodeId: string, parent: typeof result) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const nodeName = localEntriesNameMap[nodeId] || nodeId;
      const isFile = !localEntriesChildParentMap[nodeId];

      const nodeItem = {
        value: nodeId,
        label: nodeName,
        nodeProps: {
          canSelect: isFile,
          id: nodeId,
          isFolder: !isFile,
        },
      };

      if (!isFile) {
        // It's a folder, process children
        const children: typeof result = [];
        nodeItem.children = children;

        // Get all children of this folder
        const childrenIds = Object.entries(localEntriesChildParentMap)
          .filter(([_, parentId]) => parentId === nodeId)
          .map(([childId]) => childId);

        // Recursively process each child
        childrenIds.forEach((childId) => traverseEntries(childId, children));

        // Sort children (folders first, then alphabetically)
        children.sort((a, b) => {
          const aIsFolder = !!a.children;
          const bIsFolder = !!b.children;
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.label.localeCompare(b.label);
        });
      }

      parent.push(nodeItem);
    };

    // Find root nodes (entries without parents)
    const rootIds = Object.keys(localEntriesNameMap).filter(
      (id) => !Object.values(localEntriesChildParentMap).includes(id),
    );

    // Process each root node
    rootIds.forEach((rootId) => traverseEntries(rootId, result));

    return result;
  }, [localEntriesChildParentMap, localEntriesNameMap]);

  const fileSystemEntries = buildEntryTree();
  /**
   * Consts
   */
  const viewsToDisplay = views
    .filter((view) => !!view.sourceId)
    .map(({ view_name, sourceId: id }) => ({
      value: id,
      label: view_name,
      nodeProps: { canSelect: true, id },
    }));

  const openView = async (id: string) => {
    if (activeTab?.sourceId === id) return;

    openTab(id, 'file');
  };

  const handleDeleteSelected = async (items: string[]) => {
    onDeleteDataSource({
      ids: items,
      type: 'views',
    });
  };

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Create a query',
          onClick: (item) => {
            createQueryFile({
              name: `${item.label}_query`,
              content: `SELECT * FROM ${item.label};`,
            });
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Copy name',
          onClick: (item) => {
            copy(item.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => onDeleteDataSource({ ids: [item.value], type: 'views' }),
        },
      ],
    },
  ];

  const handleDeleteTab = async (id: string) => {
    const tab = tabs.find((t) => t.sourceId === id);
    if (tab) {
      deleteTabs([tab.id]);
    }
  };

  return (
    <SourcesListView
      parentDataTestId="view-explorer"
      list={viewsToDisplay}
      onDeleteSelected={handleDeleteSelected}
      onItemClick={openView}
      menuItems={menuItems}
      activeItemKey={activeTab?.sourceId || ''}
      loading={appLoadState === 'init'}
      onActiveCloseClick={handleDeleteTab}
    />
  );
});
