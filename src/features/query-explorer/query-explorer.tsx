import { useAppNotifications } from '@components/app-notifications';
import { MenuItem, SourcesListView, TypedTreeNodeData } from '@components/sources-list-view';
import { ActionIcon, Divider, Group, Text } from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { memo, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';

import {
  createSQLScript,
  createTabFromScript,
  deleteTab,
  findTabFromScript,
  setActiveTabId,
  setPreviewTabId,
  useInitStore,
  useSqlScriptForActiveTab,
  useSqlScriptNameMap,
} from '@store/init-store';
import { DataSourceIcon } from '@features/data-source-icon';
import { SQLScriptId } from '@models/sql-script';

export const QueryExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { showSuccess } = useAppNotifications();
  const { copy } = useClipboard();

  /**
   * Global state
   */
  const activeSqlScriptId = useSqlScriptForActiveTab();
  const appLoadState = useInitStore.use.appLoadState();

  const sqlScripts = useSqlScriptNameMap();

  /**
   * Local state
   */
  // TODO: renaming is very inefficient, as we re-render this entire component on each
  // keystroke. We should probably push the entire menu or make `rename` a feature of
  // the sources-list-view and handle rename there, only passing the checkNewName callback
  const [renaming, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [[pendingRenameItemName, pendingRenameItemId], setPendingRename] = useState<
    [string, SQLScriptId | null]
  >(['', null]);

  /**
   * Consts
   */
  const sqlScriptList: TypedTreeNodeData<SQLScriptId>[] = Array.from(sqlScripts).map(
    ([sqlScriptId, sqlScriptName]) => ({
      value: sqlScriptId,
      label: `${sqlScriptName}.sql`,
      nodeProps: { canSelect: true },
    }),
  );

  // Renaming errors
  const textInputError = pendingRenameItemName.length === 0 ? 'Name cannot be empty' : undefined;
  const notUniqueError = Array.from(sqlScripts)
    .filter(([id, _]) => id !== pendingRenameItemId)
    .some(([_, name]) => name.toLowerCase() === pendingRenameItemName.toLowerCase())
    ? 'Name must be unique'
    : undefined;
  const invalidCharactersError = pendingRenameItemName.match(/[^a-zA-Z0-9()_-]/)
    ? 'Name must contain only letters, numbers, underscores, dashes and parentheses'
    : undefined;

  const renameInputError = !renaming
    ? ''
    : textInputError || notUniqueError || invalidCharactersError;

  const handleScriptSelect = (id: SQLScriptId) => {
    // Check if the tab is already open
    const existingTab = findTabFromScript(id);
    if (existingTab) {
      // If the tab is already open, just set as active and do not change preview
      setActiveTabId(existingTab.id);
      return;
    }

    // Net new. Create a tab
    const tab = createTabFromScript(id);
    // Then set it as active & preview
    setActiveTabId(tab.id);
    setPreviewTabId(tab.id);
  };

  const handleAddQuery = () => {
    const newEmptyScript = createSQLScript();
    const newTab = createTabFromScript(newEmptyScript);
    setActiveTabId(newTab.id);
  };

  const handleDeleteTab = (id: SQLScriptId) => {
    const tab = findTabFromScript(id);
    if (tab) {
      deleteTab(tab.id);
    }
  };

  /**
   * Rename query handlers
   */
  const handleRenameSubmit = async () => {
    if (pendingRenameItemId) {
      const updatedSource = await onRenameDataSource({
        name: pendingRenameItemName,
        id: pendingRenameItemId!,
      });
      const tab = tabsList.find((t) => t.sourceId === pendingRenameItemId);
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
    setPendingRename(['', null]);
    closeRename();
  };

  const onRenameModalInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPendingRename([event.currentTarget.value, pendingRenameItemId]);
  };

  const handleRenameClick = (id: SQLScriptId) => {
    const scriptName = sqlScripts.get(id)!;
    setPendingRename([scriptName, id]);
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

  const menuItems: MenuItem<SQLScriptId>[] = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (sqlScript) => {
            copy(sqlScript.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
        {
          label: 'Rename',
          onClick: (sqlScript) => handleRenameClick(sqlScript.value),
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
      <SourcesListView<SQLScriptId>
        parentDataTestId="queries-list"
        onDeleteSelected={handleDeleteSelected}
        list={sqlScriptList}
        menuItems={menuItems}
        onItemClick={handleScriptSelect}
        activeItemKey={activeSqlScriptId}
        loading={appLoadState === 'init'}
        onActiveCloseClick={handleDeleteTab}
        renderIcon={(_) => <DataSourceIcon iconType="sql-script" size={16} />}
        renameItemId={pendingRenameItemId}
        isItemRenaming={renaming}
        onItemRename={handleRenameClick}
        onRenameChange={onRenameModalInputChange}
        renameValue={pendingRenameItemName}
        onRenameClose={handleRenameCancel}
        onRenameSubmit={handleRenameSubmit}
        renameInputError={renameInputError}
      />
    </>
  );
});
