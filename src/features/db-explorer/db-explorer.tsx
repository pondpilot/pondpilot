import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { useAppContext, useDataSourcesActions } from '@features/app-context';
import { useAppStore } from '@store/app-store';
import { memo } from 'react';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import { SYSTEM_DUCKDB_SHEMAS } from '@features/editor/auto-complete';
import { useCreateQueryFileMutation, useFileHandlesQuery } from '@store/app-idb-store';
import { getDBIconByType } from './utils';
import { useInitStore } from '@store/init-store';

/**
 * Displays a list of views
 */
export const DbExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { onDeleteDataSource } = useDataSourcesActions();
  const clipboard = useClipboard();
  const { showSuccess } = useAppNotifications();
  const { mutate: createQueryFile } = useCreateQueryFileMutation();

  /**
   * Store access
   */
  const databases = useAppStore((state) => state.databases);
  const appLoadState = useInitStore((state) => state.appLoadState);
  const { data: sessionFiles = [] } = useFileHandlesQuery();

  /**
   * Consts
   */
  const itemsToDisplay = databases
    .filter((item) => sessionFiles.some((source) => source.name === item.name))
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
      ids: items,
      type: 'databases',
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

            createQueryFile({
              name: `${item.label}_query`,
              content: query,
            });
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => onDeleteDataSource({ ids: [item.value], type: 'databases' }),
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
      activeItemKey=""
      loading={appLoadState === 'init'}
      renderIcon={(id) => getDBIconByType(id as any)}
    />
  );
});
