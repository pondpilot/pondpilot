import { ExplorerTree } from '@components/explorer-tree/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree/model';
import { deleteSqlScripts, renameSQLScript } from '@controllers/sql-script';
import {
  deleteTabByScriptId,
  findTabFromScript,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import { SQLScriptId } from '@models/sql-script';
import { useSqlScriptNameMap, useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { exportSingleScript } from '@utils/script-export';
import { createShareableScriptUrl } from '@utils/script-sharing';
import { memo } from 'react';

import { ScriptExplorerContext, ScrtiptNodeTypeToIdTypeMap } from './model';
import { ScriptExplorerNode } from './script-explorer-node';

// We could have used closure, but this is possibly slightly more performant
const onNodeClick = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>, tree: any): void => {
  const id = node.value;

  // Don't open tabs during multi-selection operations
  // This callback is NOT called during Ctrl/Cmd+Click (multi-selection)
  // It's only called for regular clicks and the first click in a multi-select

  // If there are already multiple items selected, don't switch tabs
  // This preserves the multi-selection state
  if (tree.selectedState.length > 1) {
    return;
  }

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

const handleExportScript = (node: TreeNodeData<ScrtiptNodeTypeToIdTypeMap>): void => {
  const scriptId = node.value;
  const script = useAppStore.getState().sqlScripts.get(scriptId);

  if (!script) return;

  exportSingleScript(script);
};

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
        {
          label: 'Export script',
          onClick: handleExportScript,
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

  // Use the common explorer context hook
  const enhancedExtraData = useExplorerContext<ScrtiptNodeTypeToIdTypeMap>({
    nodes: sqlScriptTree,
    handleDeleteSelected: (ids) => deleteSqlScripts(ids as SQLScriptId[]),
  }) as ScriptExplorerContext;

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
