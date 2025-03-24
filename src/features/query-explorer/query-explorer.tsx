/* eslint-disable no-console */
import { useAppNotifications } from '@components/app-notifications';
import { MenuItem, SourcesListView } from '@components/sources-list-view';
import { ActionIcon, Divider, Group, Text } from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { useAppContext } from '@features/app-context';
import { memo, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { IconCode, IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '@store/editor-store';
import {
  useCreateQueryFileMutation,
  useDeleteQueryFilesMutation,
  useQueryFilesQuery,
} from '@store/app-idb-store/useEditorFileQuery';
import {
  useAllTabsQuery,
  useSetActiveTabMutation,
  useTabMutation,
  useTabsDeleteMutation,
} from '@store/app-idb-store';

export const QueryExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { onRenameDataSource, onOpenQuery, onTabSwitch, onSaveEditor } = useAppContext();
  const { showSuccess } = useAppNotifications();
  const { copy } = useClipboard();

  /**
   * Global state
   */
  const queryLoading = useAppStore((state) => state.queryRunning);
  const appStatus = useAppStore((state) => state.appStatus);
  const activeTab = useAppStore((state) => state.activeTab);

  const setLastQueryDirty = useEditorStore((state) => state.setLastQueryDirty);
  const editorValue = useEditorStore((state) => state.editorValue);
  const lastQueryDirty = useEditorStore((state) => state.lastQueryDirty);

  /**
   * Local state
   */
  const [renaming, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [newItemName, setNewName] = useState('');
  const [itemIdBufferValue, setItemIdBufferValue] = useState<string | null>(null);

  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();
  const { mutateAsync: createTab } = useTabMutation();
  const { data: queryFiles = [] } = useQueryFilesQuery();
  const { data: tabsList = [] } = useAllTabsQuery();
  const { mutateAsync: deleteTabs } = useTabsDeleteMutation();
  const { mutateAsync: deleteQueryFile } = useDeleteQueryFilesMutation();
  const { mutateAsync: switchTab } = useSetActiveTabMutation();

  /**
   * Consts
   */
  const queriesList = queryFiles.map((query) => ({
    value: query.id,
    label: query.name,
    nodeProps: { canSelect: true },
  }));
  const textInputError = newItemName.length === 0 ? 'Name cannot be empty' : undefined;
  const notUniqueError = queriesList.some((query) => {
    if (itemIdBufferValue === query.value) return false;

    const name = query.label.toLowerCase().split('.')[0];
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

    const tabExists = tabsList.find((tab) => tab.sourceId === path);
    const queryFile = queryFiles.find((query) => query.id === path);

    if (!queryFile) {
      throw new Error(`Query file with id ${path} not found`);
    }

    if (tabExists) {
      await switchTab(tabExists.id);
    } else {
      await createTab({
        sourceId: queryFile.id,
        name: queryFile.name,
        type: 'query',
        active: true,
        stable: false,
        state: 'pending',
        editor: {
          fullQuery: '',
          lastQuery: '',
          codeSelection: {
            start: 0,
            end: 0,
          },
          undoHistory: [],
        },
        layout: {
          tableColumnWidth: {},
          editorPaneHeight: 0,
          dataViewPaneHeight: 0,
        },
        dataView: {
          data: null,
          rowCount: 0,
          columnCount: 0,
        },
        pagination: {
          page: 0,
          limit: 0,
        },
        sort: {
          column: '',
          order: 'desc',
        },
      });
    }

    onOpenQuery(path);
    onTabSwitch({ path, mode: 'query' });
  };

  const handleAddQuery = async () => {
    // await saveCurrentQuery();

    const newQueryFile = await createQueryFile({
      name: 'query',
    });

    createTab({
      sourceId: newQueryFile.id,
      name: newQueryFile.name,
      type: 'query',
      active: true,
      stable: true,
      state: 'pending',
      editor: {
        fullQuery: '',
        lastQuery: '',
        codeSelection: {
          start: 0,
          end: 0,
        },
        undoHistory: [],
      },
      layout: {
        tableColumnWidth: {},
        editorPaneHeight: 0,
        dataViewPaneHeight: 0,
      },
      dataView: {
        data: null,
        rowCount: 0,
        columnCount: 0,
      },
      pagination: {
        page: 0,
        limit: 0,
      },
      sort: {
        column: '',
        order: 'desc',
      },
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
    const queryToChange = queriesList.find((query) => query.value === id)!.label;
    setNewName(queryToChange.split('.')[0] || 'query-name');
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
              data-testid="add-query-button"
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
        disabled={queryLoading}
        activeItemKey={tabsList.find((tab) => tab.active)?.sourceId || ''}
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
