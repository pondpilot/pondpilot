import { MenuItem, SourcesListView, TypedTreeNodeData } from '@components/sources-list-view';
import { useAppStore } from '@store/app-store';
import { memo } from 'react';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import { SYSTEM_DUCKDB_SCHEMAS } from '@features/editor/auto-complete';
import { useFileHandlesQuery } from '@store/app-idb-store';
import { createSQLScript, getOrCreateTabFromScript, useInitStore } from '@store/init-store';

/**
 * Displays a list of views
 */
export const DbExplorer = memo(() => {
  /**
   * Common hooks
   */
  const clipboard = useClipboard();
  const { showSuccess } = useAppNotifications();

  /**
   * Store access
   */
  const databases = useAppStore((state) => state.databases);
  const appLoadState = useInitStore.use.appLoadState();
  const { data: sessionFiles = [] } = useFileHandlesQuery();

  /**
   * Consts
   */
  const itemsToDisplay = databases
    .filter((item) => sessionFiles.some((source) => source.name === item.name))
    .map(
      (item) =>
        ({
          value: item.name,
          label: item.name,
          iconType: 'db',
          nodeProps: {
            id: 'db',
          },
          children: item.schemas
            ?.filter((schema) => !SYSTEM_DUCKDB_SCHEMAS.includes(schema.name))
            .map((schema) => ({
              value: `${item.name}/${schema.name}`,
              nodeProps: {
                id: 'schema',
              },
              iconType: 'db-schema',
              label: schema.name,
              children: schema.tables?.map((table) => ({
                value: `${item.name}/${schema.name}/${table.name}`,
                label: table.name,
                iconType: 'db-table',
                nodeProps: {
                  id: 'table',
                },
              })),
            })),
        }) as TypedTreeNodeData,
    );

  const handleDeleteSelected = async (items: string[]) => {};

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

            const newScript = createSQLScript(`${item.label}_query`, query);
            getOrCreateTabFromScript(newScript, true);
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => {},
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
    />
  );
});
