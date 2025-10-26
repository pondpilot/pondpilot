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
  deleteTab,
} from '@controllers/tab';
import { renameComparisonTab } from '@controllers/tab/comparison-tab-controller';
import { RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';
import { SQLScriptId } from '@models/sql-script';
import { TabId } from '@models/tab';
import { useSqlScriptNameMap, useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { exportSingleScript } from '@utils/script-export';
import { createShareableScriptUrl } from '@utils/script-sharing';
import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ScriptExplorerContext, ScriptNodeTypeToIdTypeMap } from './model';
import { ScriptExplorerNode } from './script-explorer-node';

// Type guards for better type safety
const isComparisonNode = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
): node is TreeNodeData<ScriptNodeTypeToIdTypeMap> & { nodeType: 'comparison'; value: TabId } => {
  return node.nodeType === 'comparison';
};

const isScriptNode = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
): node is TreeNodeData<ScriptNodeTypeToIdTypeMap> & { nodeType: 'script'; value: SQLScriptId } => {
  return node.nodeType === 'script';
};

// We could have used closure, but this is possibly slightly more performant
const onNodeClick = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
  tree: MantineRenderTreeNodePayload['tree'],
): void => {
  // Don't open tabs during multi-selection operations
  // This callback is NOT called during Ctrl/Cmd+Click (multi-selection)
  // It's only called for regular clicks and the first click in a multi-select

  // If there are already multiple items selected, don't switch tabs
  // This preserves the multi-selection state
  if (tree.selectedState.length > 1) {
    return;
  }

  if (isComparisonNode(node)) {
    // For comparison tabs, just activate it
    setActiveTabId(node.value);
    return;
  }

  if (isScriptNode(node)) {
    // For script tabs
    // Check if the tab is already open
    const existingTab = findTabFromScript(node.value);
    if (existingTab) {
      // If the tab is already open, just set as active and do not change preview
      setActiveTabId(existingTab.id);
      return;
    }

    // Net new. Create an active tab
    const tab = getOrCreateTabFromScript(node.value, true);
    // Then set as & preview
    setPreviewTabId(tab.id);
  }
};

const onCloseItemClick = (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>): void => {
  if (isComparisonNode(node)) {
    deleteTab([node.value]);
  } else if (isScriptNode(node)) {
    deleteTabByScriptId(node.value);
  }
};

const onDelete = (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>): void => {
  if (isComparisonNode(node)) {
    deleteTab([node.value]);
  } else if (isScriptNode(node)) {
    deleteSqlScripts([node.value]);
  }
};

const MAX_NAME_LENGTH = 100;

const validateRename = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
  newName: string,
  allNames: string[],
): string | null => {
  const trimmedName = newName.trim();

  if (trimmedName.length === 0) {
    return 'Name cannot be empty';
  }

  // Check if there are leading or trailing spaces
  if (newName !== trimmedName) {
    return 'Name cannot have leading or trailing spaces';
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    return `Name must be ${MAX_NAME_LENGTH} characters or less`;
  }

  if (allNames.some((name) => name.toLowerCase() === trimmedName.toLowerCase())) {
    return 'Name must be unique';
  }

  if (!/^[a-zA-Z0-9()_\- ]+$/.test(trimmedName)) {
    return 'Name must contain only letters, numbers, spaces, underscores, dashes and parentheses';
  }

  return null;
};

const prepareRenameValue = (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>): string => {
  if (node.nodeType === 'comparison') {
    return node.label;
  }
  // Strip the .sql extension for scripts
  return node.label.replace(/\.sql$/, '');
};

// Helper to create rename validation callback
const createValidateRename = (getAllNamesExcept: (nodeId: string) => string[]) => {
  return (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>, newName: string) =>
    validateRename(node, newName, getAllNamesExcept(node.value));
};

const handleExportScript = (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>): void => {
  if (!isScriptNode(node)) return;

  const script = useAppStore.getState().sqlScripts.get(node.value);

  if (!script) return;

  exportSingleScript(script);
};

// Custom hook to get comparison tabs with proper memoization
// Returns an array of [id, name] tuples - only changes when tabs are added/removed/renamed
function useComparisonTabs(): ReadonlyArray<readonly [TabId, string]> {
  return useAppStore(
    useShallow((state) => {
      const result: Array<readonly [TabId, string]> = [];
      for (const tab of state.tabs.values()) {
        if (tab.type === 'comparison') {
          result.push([tab.id, tab.name]);
        }
      }
      return result;
    }),
  );
}

export const ScriptExplorer = memo(() => {
  /**
   * Global state
   */
  const sqlScripts = useSqlScriptNameMap();
  const comparisonTabs = useComparisonTabs();

  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return activeTab?.type === 'script' || activeTab?.type === 'comparison';
  });

  /**
   * Consts
   */
  const scriptsArray = useMemo(
    () =>
      Array.from(sqlScripts).sort(([, leftName], [, rightName]) =>
        leftName.localeCompare(rightName),
      ),
    [sqlScripts],
  );

  const comparisonsArray = useMemo(
    () =>
      Array.from(comparisonTabs).sort(([, leftName], [, rightName]) =>
        leftName.localeCompare(rightName),
      ),
    [comparisonTabs],
  );

  // Get all names for validation (excluding current node's name in validateRename)
  const getAllNamesExcept = useMemo(
    () => (nodeId: string) => {
      const scriptNames = scriptsArray.filter(([id]) => id !== nodeId).map(([, name]) => name);
      const comparisonNames = comparisonsArray
        .filter(([id]) => id !== nodeId)
        .map(([, name]) => name);
      return [...scriptNames, ...comparisonNames];
    },
    [scriptsArray, comparisonsArray],
  );

  const scriptContextMenu: TreeNodeMenuType<TreeNodeData<ScriptNodeTypeToIdTypeMap>> = useMemo(
    () => [
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
              if (!isScriptNode(sqlScript)) return;

              const script = useAppStore.getState().sqlScripts.get(sqlScript.value);

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
    ],
    [],
  );

  const comparisonContextMenu: TreeNodeMenuType<TreeNodeData<ScriptNodeTypeToIdTypeMap>> = useMemo(
    () => [
      {
        children: [
          {
            label: 'Copy name',
            onClick: (node) => {
              copyToClipboard(node.label, { showNotification: true });
            },
          },
        ],
      },
    ],
    [],
  );

  // Create stable rename callbacks
  const scriptRenameCallbacks = useMemo(
    () => ({
      validateRename: createValidateRename(getAllNamesExcept),
      onRenameSubmit: (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>, newName: string) => {
        if (isScriptNode(node)) {
          renameSQLScript(node.value, newName);
        }
      },
      prepareRenameValue,
    }),
    [getAllNamesExcept],
  );

  const comparisonRenameCallbacks = useMemo(
    () => ({
      validateRename: createValidateRename(getAllNamesExcept),
      onRenameSubmit: (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>, newName: string) => {
        if (isComparisonNode(node)) {
          renameComparisonTab(node.value, newName);
        }
      },
      prepareRenameValue,
    }),
    [getAllNamesExcept],
  );

  const sqlScriptTree: TreeNodeData<ScriptNodeTypeToIdTypeMap>[] = useMemo(
    () =>
      scriptsArray.map(
        ([sqlScriptId, sqlScriptName]) =>
          ({
            nodeType: 'script',
            value: sqlScriptId,
            label: `${sqlScriptName}.sql`,
            iconType: 'code-file',
            isDisabled: false,
            isSelectable: true,
            onNodeClick,
            renameCallbacks: scriptRenameCallbacks,
            onDelete,
            onCloseItemClick,
            contextMenu: scriptContextMenu,
            // no children
          }) as TreeNodeData<ScriptNodeTypeToIdTypeMap>,
      ),
    [scriptsArray, scriptRenameCallbacks, scriptContextMenu],
  );

  const comparisonTree: TreeNodeData<ScriptNodeTypeToIdTypeMap>[] = useMemo(
    () =>
      comparisonsArray.map(
        ([tabId, comparisonName]) =>
          ({
            nodeType: 'comparison',
            value: tabId,
            label: comparisonName,
            iconType: 'comparison',
            isDisabled: false,
            isSelectable: true,
            onNodeClick,
            renameCallbacks: comparisonRenameCallbacks,
            onDelete,
            onCloseItemClick,
            contextMenu: comparisonContextMenu,
            // no children
          }) as TreeNodeData<ScriptNodeTypeToIdTypeMap>,
      ),
    [comparisonsArray, comparisonRenameCallbacks, comparisonContextMenu],
  );

  // Combine and sort all nodes alphabetically
  const allNodes = useMemo(
    () => [...sqlScriptTree, ...comparisonTree].sort((a, b) => a.label.localeCompare(b.label)),
    [sqlScriptTree, comparisonTree],
  );

  // Create Sets for efficient O(1) lookup instead of O(n) array search
  const scriptIdsSet = useMemo(() => new Set(scriptsArray.map(([id]) => id)), [scriptsArray]);
  const comparisonIdsSet = useMemo(
    () => new Set(comparisonsArray.map(([id]) => id)),
    [comparisonsArray],
  );

  // Memoize the delete handler to prevent unnecessary re-renders
  const handleDeleteSelected = useMemo(
    () => (ids: (SQLScriptId | TabId)[]) => {
      const scriptIds: SQLScriptId[] = [];
      const comparisonIds: TabId[] = [];

      // Use Set lookups for O(1) performance instead of O(n) array.some()
      ids.forEach((id) => {
        if (scriptIdsSet.has(id as SQLScriptId)) {
          scriptIds.push(id as SQLScriptId);
        } else if (comparisonIdsSet.has(id as TabId)) {
          comparisonIds.push(id as TabId);
        }
      });

      if (scriptIds.length > 0) {
        deleteSqlScripts(scriptIds);
      }
      if (comparisonIds.length > 0) {
        deleteTab(comparisonIds);
      }
    },
    [scriptIdsSet, comparisonIdsSet],
  );

  // Use the common explorer context hook
  const enhancedExtraData = useExplorerContext<ScriptNodeTypeToIdTypeMap>({
    nodes: allNodes,
    handleDeleteSelected,
  }) as ScriptExplorerContext;

  return (
    <ExplorerTree<ScriptNodeTypeToIdTypeMap, ScriptExplorerContext>
      nodes={allNodes}
      dataTestIdPrefix="script-explorer"
      TreeNodeComponent={ScriptExplorerNode}
      hasActiveElement={hasActiveElement}
      extraData={enhancedExtraData}
    />
  );
});
