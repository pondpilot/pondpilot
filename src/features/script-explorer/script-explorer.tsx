import { useAppNotifications } from '@components/app-notifications';
import { useClipboard } from '@mantine/hooks';
import { memo } from 'react';

import { useSqlScriptNameMap } from '@store/app-store';
import { SQLScriptId } from '@models/sql-script';
import { ExplorerTree } from '@components/explorer-tree/explorer-tree';
import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree/model';
import {
  deleteTabByScriptId,
  findTabFromScript,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { deleteSqlScripts, renameSQLScript } from '@controllers/sql-script';
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
  const sqlScripts = useSqlScriptNameMap();

  /**
   * Consts
   */
  const scriptsArray = Array.from(sqlScripts).sort(([, leftName], [, rightName]) =>
    leftName.localeCompare(rightName),
  );
  const contextMenu: TreeNodeMenuType<TreeNodeData<ScrtiptNodeTypeToIdTypeMap>> = [
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

  return (
    <ExplorerTree<ScrtiptNodeTypeToIdTypeMap>
      nodes={sqlScriptTree}
      dataTestIdPrefix="script-explorer"
      TreeNodeComponent={ScriptExplorerNode}
      onDeleteSelected={deleteSqlScripts}
      extraData={undefined}
    />
  );
});
