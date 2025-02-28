/* eslint-disable no-console */
import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { useAppContext } from 'features/app-context';
import { useAppStore } from 'store/app-store';
import { useClipboard } from '@mantine/hooks';
import { memo, useCallback } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { IconCsv, IconJson, IconTable } from '@tabler/icons-react';

/**
 * Displays a list of views
 */
export const ViewExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { onDeleteDataSource, onOpenView, onTabSwitch, onCreateQueryFile, onDeleteTabs } =
    useAppContext();
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();

  /**
   * Store access
   */
  const views = useAppStore((state) => state.views);
  const queryLoading = useAppStore((state) => state.queryRunning);
  const currentView = useAppStore((state) => state.currentView);
  const appStatus = useAppStore((state) => state.appStatus);
  const activeTab = useAppStore((state) => state.activeTab);
  const tabs = useAppStore((state) => state.tabs);
  const sessionFiles = useAppStore((state) => state.sessionFiles);

  /**
   * Consts
   */
  const viewsToDisplay = views.map((view) => ({
    value: view,
    label: view,
    nodeProps: { canSelect: true, id: view },
  }));

  const openView = async (viewName: string) => {
    if (activeTab?.path === viewName) return;

    onOpenView(viewName);
    onTabSwitch({
      path: viewName,
      mode: 'view',
    });
  };

  const handleViewClick = async (viewName: string) => {
    openView(viewName);
  };

  const handleDeleteSelected = async (items: string[]) => {
    onDeleteDataSource({
      paths: items,
      type: 'view',
    });
  };

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Create a query',
          onClick: (item) => {
            onCreateQueryFile({
              entities: [
                {
                  name: `${item.label}_query`,
                  content: `SELECT * FROM ${item.label};`,
                },
              ],
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
          onClick: (item) => onDeleteDataSource({ paths: [item.label], type: 'view' }),
        },
      ],
    },
  ];

  const handleDeleteTab = async (id: string) => {
    const tab = tabs.find((t) => t.path === id);
    if (tab) {
      onDeleteTabs([tab]);
    }
  };

  const getIcon = useCallback(
    (id: string | undefined) => {
      const fileExt = sessionFiles?.sources.find((f) => f.name === id)?.ext as string;
      const iconsMap = {
        csv: <IconCsv size={16} />,
        json: <IconJson size={16} />,
      }[fileExt];
      return iconsMap || <IconTable size={16} />;
    },
    [sessionFiles],
  );

  return (
    <SourcesListView
      list={viewsToDisplay}
      onDeleteSelected={handleDeleteSelected}
      onItemClick={handleViewClick}
      menuItems={menuItems}
      disabled={queryLoading}
      activeItemKey={currentView}
      loading={appStatus === 'initializing'}
      onActiveCloseClick={handleDeleteTab}
      renderIcon={getIcon}
    />
  );
});
