import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { useAppContext, useDataSourcesActions } from '@features/app-context';
import { useAppStore } from '@store/app-store';
import { useClipboard } from '@mantine/hooks';
import { memo, useCallback } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { IconCsv, IconJson, IconTable } from '@tabler/icons-react';
import {
  useAllTabsQuery,
  useCreateQueryFileMutation,
  useFileHandlesQuery,
  useDeleteTabsMutatuion,
} from '@store/app-idb-store';
import { useInitStore } from '@store/init-store';

/**
 * Displays a list of views
 */
export const ViewExplorer = memo(() => {
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
  const { data: dataSources = [] } = useFileHandlesQuery();
  const activeTab = tabs.find((tab) => tab.active);

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

  const getIcon = useCallback(
    (id: string | undefined) => {
      const fileExt = dataSources.find((f) => f.id === id)?.ext as string;
      const iconsMap = {
        csv: <IconCsv size={16} />,
        json: <IconJson size={16} />,
      }[fileExt];
      return iconsMap || <IconTable size={16} />;
    },
    [dataSources],
  );

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
      renderIcon={getIcon}
    />
  );
});
