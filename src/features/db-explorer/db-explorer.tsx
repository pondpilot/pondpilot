import { useAppNotifications } from '@components/app-notifications';
import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { useAppContext } from '@features/app-context';
import { SYSTEM_DUCKDB_SHEMAS } from '@features/editor/auto-complete';
import { useClipboard } from '@mantine/hooks';
import { useAppStore } from '@store/app-store';
import { memo } from 'react';
import { getDBIconByType } from './utils';

/**
 * Displays a list of views
 */
export const DbExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { onDeleteDataSource, onCreateQueryFile } = useAppContext();
  const clipboard = useClipboard();
  const { showSuccess } = useAppNotifications();

  /**
   * Store access
   */
  const databases = useAppStore((state) => state.databases);
  const queryLoading = useAppStore((state) => state.queryRunning);
  const currentView = useAppStore((state) => state.currentView);
  const appStatus = useAppStore((state) => state.appStatus);
  const sessionFiles = useAppStore((state) => state.sessionFiles);

  /**
   * Consts
   */
  const itemsToDisplay = databases
    .filter((item) => sessionFiles?.sources.some((source) => source.name === item.name))
    .map((item) => ({
      value: item.name,
      label: item.name,
      nodeProps: {
        id: 'db',
        canSelect: true,
      },
      children: item.schemas
        ?.filter((schema) => !SYSTEM_DUCKDB_SHEMAS.includes(schema.name))
        .map((schema) => ({
          value: `${item.name}/${schema.name}`,
          nodeProps: {
            id: 'schema',
            canSelect: false,
          },
          label: schema.name,
          children: schema.tables?.map((table) => ({
            value: `${item.name}/${schema.name}/${table.name}`,
            label: table.name,
            nodeProps: {
              id: 'table',
              canSelect: false,
            },
          })),
        })),
    }));

  const handleDeleteSelected = async (items: string[]) => {
    onDeleteDataSource({
      paths: items,
      type: 'database',
    });
  };

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (item) => {
            clipboard.copy(item.label);
            showSuccess({ message: 'Copied', autoClose: 800 });
          },
        },
        {
          label: 'Create a query',
          onClick: (item) => {
            const isDB = item.value.split('/').length === 1;
            const query = isDB
              ? `SELECT * FROM ${item.label}.data;`
              : `SELECT * FROM ${item.value.replaceAll('/', '.')};`;

            onCreateQueryFile({
              entities: [
                {
                  name: `${item.label}_query`,
                  content: query,
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
          label: 'Delete',
          onClick: (item) => onDeleteDataSource({ paths: [item.label], type: 'database' }),
        },
      ],
    },
  ];
  return (
    <SourcesListView
      parentDataTestId="db-explorer"
      list={itemsToDisplay}
      onDeleteSelected={handleDeleteSelected}
      menuItems={menuItems}
      disabled={queryLoading}
      activeItemKey={currentView}
      loading={appStatus === 'initializing'}
      renderIcon={(id) => getDBIconByType(id as any)}
    />
  );
});
