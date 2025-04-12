import { useAppNotifications } from '@components/app-notifications';
import { ActionIcon, Divider, Group, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { memo } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';

import {
  createSQLScript,
  getOrCreateTabFromScript,
  useInitStore,
  useSqlScriptNameMap,
  renameSQLScript,
  deleteSqlScripts,
  deleteTabByScriptId,
  findTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@store/init-store';
import { SQLScriptId } from '@models/sql-script';
import { ExplorerTree } from '@components/sources-list-view/explorer-tree';
import { TreeMenu, TreeNodeData } from '@components/sources-list-view/model';
import { ScrtiptNodeTypeToIdTypeMap } from './model';
import { ScriptExplorerNode } from './script-explorer-node';

// We could have used closure, but this is possibly slightly more performant
const onNodeClick = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>): void => {
  const id = node.value;

  // Check if the tab is already open
  const existingTab = findTabFromScript(id);
  if (existingTab) {
    // If the tab is already open, just set as active and do not change preview
    setActiveTabId(existingTab.id);
    return;
  }

  // Net new. Create an active tab
  const tab = getOrCreateTabFromScript(id, true);
  // Then set as & preview
  setPreviewTabId(tab.id);
};

const onCloseItemClick = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>): void => {
  deleteTabByScriptId(node.value);
};

const onDelete = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>): void => {
  deleteSqlScripts([node.value]);
};

const validateRename = (
  node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>,
  newName: string,
  scriptsArray: [SQLScriptId, string][],
): string | null => {
  const textInputError = newName.length === 0 ? 'Name cannot be empty' : undefined;
  const notUniqueError = scriptsArray
    .filter(([id, _]) => id !== node.value)
    .some(([_, name]) => name.toLowerCase() === newName.toLowerCase())
    ? 'Name must be unique'
    : undefined;
  const invalidCharactersError = newName.match(/[^a-zA-Z0-9()_-]/)
    ? 'Name must contain only letters, numbers, underscores, dashes and parentheses'
    : undefined;

  return textInputError || notUniqueError || invalidCharactersError || null;
};

const prepareRenameValue = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>): string =>
  // Strip the .sql extension
  node.label.replace(/\.sql$/, '');

export const ScriptExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { showSuccess } = useAppNotifications();
  const { copy } = useClipboard();

  /**
   * Global state
   */
  const appLoadState = useInitStore.use.appLoadState();
  const sqlScripts = useSqlScriptNameMap();

  /**
   * Local state
   */

  /**
   * Consts
   */
  const scriptsArray = Array.from(sqlScripts);
  const contextMenu: TreeMenu<TreeNodeData<ScrtiptNodeTypeToIdTypeMap>> = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (sqlScript) => {
            copy(sqlScript.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
      ],
    },
  ];

  const sqlScriptTree: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>[] = scriptsArray.map(
    ([sqlScriptId, sqlScriptName]) => ({
      nodeType: 'script',
      value: sqlScriptId,
      label: `${sqlScriptName}.sql`,
      iconType: 'code-file',
      isDisabled: false,
      isSelectable: true,
      onNodeClick,
      renameCallbacks: {
        validateRename: (node, newName) => validateRename(node, newName, scriptsArray),
        onRenameSubmit: (node, newName) => {
          renameSQLScript(node.value, newName);
        },
        prepareRenameValue,
      },
      onDelete,
      onCloseItemClick,
      contextMenu,
      // no children
    }),
  );

  const handleAddQuery = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  const actions = [
    {
      label: 'Add query',
      onClick: handleAddQuery,
      icon: <IconPlus />,
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
              data-testid={setDataTestId('script-explorer-add-script-button')}
              onClick={action.onClick}
              size={16}
              key={action.label}
            >
              {action.icon}
            </ActionIcon>
          ))}
        </Group>
      </Group>
      <ExplorerTree<ScrtiptNodeTypeToIdTypeMap>
        nodes={sqlScriptTree}
        loading={appLoadState === 'init'}
        dataTestIdPrefix="script-explorer"
        TreeNodeComponent={ScriptExplorerNode}
        onDeleteSelected={deleteSqlScripts}
      />
    </>
  );
});
