import { useAppNotifications } from '@components/app-notifications';
import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { ActionIcon, Divider, Group, Text } from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { useAppContext } from '@features/app-context';
import { memo, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { IconCode, IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '@store/editor-store';
import { setDataTestId } from '@utils/test-id';

export const QueryExplorer = memo(() => {
  /**
   * Common hooks
   */
  const {
    onCreateQueryFile,
    onDeleteDataSource,
    onRenameDataSource,
    onOpenQuery,
    onTabSwitch,
    onDeleteTabs,
    onSaveEditor,
  } = useAppContext();
  const { showSuccess } = useAppNotifications();
  const { copy } = useClipboard();

  /**
   * Global state
   */
  const queries = useAppStore((state) => state.queries);
  const queryLoading = useAppStore((state) => state.queryRunning);
  const currentQuery = useAppStore((state) => state.currentQuery);
  const appStatus = useAppStore((state) => state.appStatus);
  const activeTab = useAppStore((state) => state.activeTab);
  const tabs = useAppStore((state) => state.tabs);

  const setLastQueryDirty = useEditorStore((state) => state.setLastQueryDirty);
  const editorValue = useEditorStore((state) => state.editorValue);
  const lastQueryDirty = useEditorStore((state) => state.lastQueryDirty);

  /**
   * Local state
   */
  const [renaming, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [newItemName, setNewName] = useState('');
  const [itemIdBufferValue, setItemIdBufferValue] = useState<string | null>(null);

  /**
   * Consts
   */
  const queriesList = queries.map((query) => ({
    value: query.path,
    label: query.handle.name,
    nodeProps: { canSelect: true },
  }));
  const textInputError = newItemName.length === 0 ? 'Name cannot be empty' : undefined;
  const notUniqueError = queries.some((query) => {
    if (itemIdBufferValue === query.path) return false;

    const name = query.handle.name.split('.')[0];
    return name === newItemName;
  })
    ? 'Name must be unique'
    : undefined;
  const invalidCharactersError = newItemName.match(/[^a-zA-Z0-9_-]/)
    ? 'Name must contain only letters, numbers, underscores, and dashes'
    : undefined;

  const renameInputError = !renaming
    ? ''
    : textInputError || notUniqueError || invalidCharactersError;

  /**
   * Common handlers
   */

  const saveCurrentQuery = async () => {
    if (activeTab?.mode === 'query' && lastQueryDirty) {
      await onSaveEditor({ content: editorValue, path: activeTab.path });
      setLastQueryDirty(false);
    }
  };

  const handleSetQuery = async (path: string) => {
    if (activeTab?.path === path) return;
    await saveCurrentQuery();

    onOpenQuery(path);
    onTabSwitch({ path, mode: 'query' });
  };

  const handleAddQuery = async () => {
    await saveCurrentQuery();
    onCreateQueryFile({ entities: [{ name: 'query' }] });
  };

  const handleDeleteTab = async (id: string) => {
    const tab = tabs.find((t) => t.path === id);
    if (tab) {
      await saveCurrentQuery();
      onDeleteTabs([tab]);
    }
  };

  /**
   * Rename query handlers
   */
  const handleRenameSubmit = async () => {
    await onRenameDataSource(itemIdBufferValue!, newItemName);

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
    const queryToChange = queries.find((query) => query.path === id)!.handle.name;
    setNewName(queryToChange.split('.')[0] || 'query-name');
    setItemIdBufferValue(id);
    openRename();
  };

  const handleDeleteSource = async (id: string) => {
    onDeleteDataSource({
      type: 'query',
      paths: [id],
    });
  };

  const handleDeleteSelected = async (items: string[]) => {
    if (items.length) {
      onDeleteDataSource({
        paths: items,
        type: 'query',
      });
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
          onClick: (item) => handleRenameClick(item.label),
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => handleDeleteSource(item.label),
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
        treeId="queries-list"
        onDeleteSelected={handleDeleteSelected}
        list={queriesList}
        menuItems={menuItems}
        onItemClick={handleSetQuery}
        disabled={queryLoading}
        activeItemKey={currentQuery}
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
