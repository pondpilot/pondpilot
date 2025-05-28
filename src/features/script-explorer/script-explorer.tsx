import { ExplorerTree } from '@components/explorer-tree/explorer-tree';
import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree/model';
import { createMultiSelectContextMenu } from '@components/explorer-tree/utils/multi-select-menu';
import { getFlattenNodes } from '@components/explorer-tree/utils/tree-manipulation';
import { deleteSqlScripts, renameSQLScript } from '@controllers/sql-script';
import {
  deleteTabByScriptId,
  findTabFromScript,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { useHotkeys } from '@mantine/hooks';
import { SQLScriptId } from '@models/sql-script';
import { useSqlScriptNameMap, useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { createShareableScriptUrl } from '@utils/script-sharing';
import { memo, useMemo } from 'react';

import { ScriptExplorerContext, ScrtiptNodeTypeToIdTypeMap } from './model';
import { ScriptExplorerNode } from './script-explorer-node';

// We could have used closure, but this is possibly slightly more performant
const onNodeClick = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>, _tree: any): void => {
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
    .some(([_, script]) => script.toLowerCase() === newName.toLowerCase())
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
   * Global state
   */
  const sqlScripts = useSqlScriptNameMap();

  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'script';
  });

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
            copyToClipboard(sqlScript.label, { showNotification: true });
          },
        },
        {
          label: 'Share script',
          onClick: (sqlScript) => {
            const scriptId = sqlScript.value;
            const script = useAppStore.getState().sqlScripts.get(scriptId);

            if (!script) return;

            const shareableUrl = createShareableScriptUrl(script);

            copyToClipboard(shareableUrl, {
              showNotification: true,
              notificationTitle: 'Script shared',
              notificationMessage: 'Shareable link copied to clipboard',
            });
          },
        },
      ],
    },
  ];

  const sqlScriptTree: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>[] = scriptsArray.map(
    ([sqlScriptId, sqlScriptName]) =>
      ({
        nodeType: 'script',
        value: sqlScriptId,
        label: `${sqlScriptName}.sql`,
        iconType: 'code-file',
        isDisabled: false,
        isSelectable: true,
        onNodeClick,
        renameCallbacks: {
          validateRename: (node: any, newName: string) =>
            validateRename(node, newName, scriptsArray),
          onRenameSubmit: (node: any, newName: string) => {
            renameSQLScript(node.value, newName);
          },
          prepareRenameValue,
        },
        onDelete,
        onCloseItemClick,
        contextMenu,
        // no children
      }) as any,
  );

  // Flattened nodes for selection handling
  const flattenedNodes = useMemo(() => getFlattenNodes(sqlScriptTree as any), [sqlScriptTree]);
  const flattenedNodeIds = useMemo(
    () => flattenedNodes.map((node) => node.value),
    [flattenedNodes],
  );

  const selectedDeleteableNodeIds = useMemo(
    () => flattenedNodes.filter((node) => !!node.onDelete).map((node) => node.value),
    [flattenedNodes],
  );

  // Create a function to get override context menu
  const getOverrideContextMenu = (selectedState: string[]) => {
    return createMultiSelectContextMenu(selectedState, flattenedNodes, {
      onDeleteSelected: (ids) => deleteSqlScripts(ids as SQLScriptId[]),
    }) as TreeNodeMenuType<TreeNodeData<ScrtiptNodeTypeToIdTypeMap>> | null;
  };

  const enhancedExtraData: ScriptExplorerContext = {
    getOverrideContextMenu,
    flattenedNodeIds: flattenedNodeIds as SQLScriptId[],
    selectedDeleteableNodeIds: selectedDeleteableNodeIds as SQLScriptId[],
  };

  // Hotkeys for deletion
  useHotkeys([
    [
      'mod+Backspace',
      () => {
        if (selectedDeleteableNodeIds.length === 0) {
          return;
        }
        deleteSqlScripts(selectedDeleteableNodeIds as SQLScriptId[]);
      },
    ],
  ]);

  return (
    <ExplorerTree<ScrtiptNodeTypeToIdTypeMap, ScriptExplorerContext>
      nodes={sqlScriptTree}
      dataTestIdPrefix="script-explorer"
      TreeNodeComponent={ScriptExplorerNode}
      hasActiveElement={hasActiveElement}
      extraData={enhancedExtraData}
    />
  );
});
