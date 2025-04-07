import { MenuItem, SourcesListView, TypedTreeNodeData } from '@components/sources-list-view';
import { useAppContext, useDataSourcesActions } from '@features/app-context';
import { useClipboard } from '@mantine/hooks';
import { memo, useMemo } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { useCreateQueryFileMutation } from '@store/app-idb-store';
import { useDataSourceIdForActiveTab, useInitStore } from '@store/init-store';
import { LocalEntryId } from '@models/file-system';

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
  const activeDataSourceId = useDataSourceIdForActiveTab();
  /**
   * Store access
   */
  const appLoadState = useInitStore.use.appLoadState();

  const entries = useInitStore.use.localEntries();
  const sources = useInitStore.use.dataSources();

  /**
   * Calculate views to display by doing a depth-first traversal of the entries tree
   */
  const viewsToDisplay = useMemo(() => {
    const visited = new Set<LocalEntryId>();

    const buildTree = (parentId: LocalEntryId | null): TypedTreeNodeData[] => {
      const children: TypedTreeNodeData[] = [];

      entries.forEach((entry) => {
        if (entry.parentId !== parentId || visited.has(entry.id)) return;

        visited.add(entry.id);

        if (entry.kind === 'directory') {
          children.push({
            value: entry.id,
            label: entry.name,
            iconType: 'folder',
            children: buildTree(entry.id),
          });
        } else if (entry.kind === 'file') {
          const relatedSources = Array.from(sources.values()).filter(
            (src) => src.fileSourceId === entry.id,
          );
          const fileNode: TypedTreeNodeData = {
            value: entry.id,
            label: entry.name,
            // TODO: find out how to get the icon type from the file type
            iconType: entry.fileType === 'data-source' ? 'csv' : 'csv',
          };

          if (relatedSources.length > 0) {
            fileNode.children = relatedSources.map((src) => ({
              value: src.id,
              label: src.displayName,
              // TODO: find out how to get the icon type from the file type
              iconType: 'csv',
            }));

            // Sort sources alphabetically
            fileNode.children.sort((a, b) => a.label.localeCompare(b.label));
          }

          children.push(fileNode);
        }
      });

      // Sort (folders first, then alphabetically)
      children.sort((a, b) => {
        const aIsFolder = a.iconType === 'folder';
        const bIsFolder = b.iconType === 'folder';
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.label.localeCompare(b.label);
      });

      return children;
    };

    return buildTree(null);
  }, [entries, sources, appLoadState, openTab, onDeleteDataSource]);
  /**
   * Consts
   */

  // TODO: create a function to create a new tab from a data source
  // TODO: define a function inside viewsToDisplay for each item to separate types and logic
  const onItemClick = async (id: string) => {
    // find an existing tab for this source
    // const tab = findTabFromSource(id);
    // if (tab) {
    //   setActiveTabId(tab.id);
    // } else {
    //   const newTab = createTabFromDataSource(id);
    //   setActiveTabId(newTab.id);
    // }
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
    // delete the tab
  };

  return (
    <SourcesListView
      parentDataTestId="view-explorer"
      list={viewsToDisplay}
      onDeleteSelected={handleDeleteSelected}
      onItemClick={onItemClick}
      menuItems={menuItems}
      activeItemKey={activeDataSourceId}
      loading={appLoadState === 'init'}
      onActiveCloseClick={handleDeleteTab}
    />
  );
});
