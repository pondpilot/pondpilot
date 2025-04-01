import { useAppNotifications } from '@components/app-notifications';
import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { ActionIcon, Divider, Group, Text } from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { memo, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { IconCode, IconPlus } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import {
  useCreateQueryFileMutation,
  useDeleteQueryFilesMutation,
  useQueryFilesQuery,
  useRenameQueryFileMutation,
} from '@store/app-idb-store/useEditorFileQuery';
import {
  useAllTabsQuery,
  useDeleteTabsMutatuion,
  useCreateTabMutation,
  useUpdateTabMutation,
} from '@store/app-idb-store';
import { getFileNameWithExt } from '@utils/helpers';
import { useAppContext } from '@features/app-context';

export const QueryExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { showSuccess } = useAppNotifications();
  const { copy } = useClipboard();
  const { openTab } = useAppContext();

  /**
   * Global state
   */
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();
  const { mutateAsync: createTab } = useCreateTabMutation();
  const { mutateAsync: updateTab } = useUpdateTabMutation();
  const { data: queryFiles = [] } = useQueryFilesQuery();
  const { data: tabsList = [] } = useAllTabsQuery();
  const { mutateAsync: deleteTabs } = useDeleteTabsMutatuion();
  const { mutateAsync: deleteQueryFile } = useDeleteQueryFilesMutation();
  const { mutateAsync: onRenameDataSource } = useRenameQueryFileMutation();
  const activeTab = tabsList?.find((tab) => tab.active);
  const appStatus = useAppStore((state) => state.appStatus);

  /**
   * Local state
   */
  const [renaming, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [newItemName, setNewName] = useState('');
  const [itemIdBufferValue, setItemIdBufferValue] = useState<string | null>(null);

  /**
   * Consts
   */
  const queriesList = queryFiles.map((query) => ({
    value: query.id,
    label: getFileNameWithExt(query.name, query.ext),
    nodeProps: { canSelect: true },
  }));
  const textInputError = newItemName.length === 0 ? 'Name cannot be empty' : undefined;
  const notUniqueError = queriesList.some((query) => {
    if (itemIdBufferValue === query.value) return false;

    const name = query.label;
    return name.toLowerCase() === newItemName.toLowerCase();
  })
    ? 'Name must be unique'
    : undefined;
  const invalidCharactersError = newItemName.match(/[^a-zA-Z0-9_-]/)
    ? 'Name must contain only letters, numbers, underscores, and dashes'
    : undefined;

  const renameInputError = !renaming
    ? ''
    : textInputError || notUniqueError || invalidCharactersError;

  const handleSetQuery = (sourceId: string) => {
    openTab(sourceId, 'query');
  };

  const handleAddQuery = async () => {
    const newQueryFile = await createQueryFile({
      name: 'query',
    });

    createTab({
      sourceId: newQueryFile.id,
      name: getFileNameWithExt(newQueryFile.name, newQueryFile.ext),
      type: 'query',
      active: true,
      stable: true,
      state: 'pending',
    });
  };

  const handleDeleteTab = async (id: string) => {
    const tab = tabsList.find((t) => t.sourceId === id);
    if (tab) {
      await deleteTabs([tab.id]);
    }
  };

  /**
   * Rename query handlers
   */
  const handleRenameSubmit = async () => {
    if (itemIdBufferValue) {
      const updatedSource = await onRenameDataSource({
        name: newItemName,
        id: itemIdBufferValue!,
      });
      const tab = tabsList.find((t) => t.sourceId === itemIdBufferValue);
      if (tab) {
        await updateTab({
          id: tab.id,
          name: updatedSource.name,
        });
      }
    }
    closeRename();
  };

  const handleRenameCancel = () => {
    setNewName('');
    setItemIdBufferValue(null);
    closeRename();
  };

  const onRenameModalInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(event.currentTarget.value);
  };

  const handleRenameClick = (id: string) => {
    const queryToChange = queriesList.find((query) => query.value === id)!.label;
    setNewName(queryToChange || 'query');
    setItemIdBufferValue(id);
    openRename();
  };

  const handleDeleteSource = async (id: string) => {
    await handleDeleteTab(id);
    await deleteQueryFile([id]);
  };

  const handleDeleteSelected = async (items: string[]) => {
    if (items.length) {
      const tabsIdToDelete = tabsList
        .filter((tab) => items.includes(tab.sourceId))
        .map((tab) => tab.id);

      await deleteTabs(tabsIdToDelete);
      await deleteQueryFile(items);
    }
  };

  const actions = [
    {
      label: 'Add query',
      onClick: handleAddQuery,
      icon: <IconPlus />,
    },
  ];

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (query) => {
            copy(query.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
        {
          label: 'Rename',
          onClick: (item) => handleRenameClick(item.value),
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => handleDeleteSource(item.value),
        },
      ],
    },
  ];

  return (
    <>
      <Group className="gap-2 justify-between pl-4 px-2 pt-4 pb-2 h-[50px]">
        <Text size="sm" fw={500} className="" c="text-primary">
          Queries
        </Text>
        <Group className="gap-2">
          <Divider orientation="vertical" />
          {actions.map((action) => (
            <ActionIcon
              data-testid={setDataTestId('add-query-button')}
              onClick={action.onClick}
              size={16}
              key={action.label}
            >
              {action.icon}
            </ActionIcon>
          ))}
        </Group>
      </Group>
      <SourcesListView
        parentDataTestId="queries-list"
        onDeleteSelected={handleDeleteSelected}
        list={queriesList}
        menuItems={menuItems}
        onItemClick={handleSetQuery}
        activeItemKey={activeTab?.sourceId || ''}
        loading={appStatus === 'initializing'}
        onActiveCloseClick={handleDeleteTab}
        renderIcon={() => <IconCode size={16} />}
        renameItemId={itemIdBufferValue}
        isItemRenaming={renaming}
        onItemRename={handleRenameClick}
        onRenameChange={onRenameModalInputChange}
        renameValue={newItemName}
        onRenameClose={handleRenameCancel}
        onRenameSubmit={handleRenameSubmit}
        renameInputError={renameInputError}
      />
    </>
  );
});
