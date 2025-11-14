import { ExplorerTree } from '@components/explorer-tree/explorer-tree';
import { useExplorerContext } from '@components/explorer-tree/hooks';
import { TreeNodeMenuType, TreeNodeData } from '@components/explorer-tree/model';
import { aiChatController } from '@controllers/ai-chat';
import {
  deletePersistedConversation,
  updatePersistedConversation,
} from '@controllers/ai-chat/persist';
import { deleteComparisons, renameComparison } from '@controllers/comparison';
import { deleteSqlScripts, renameSQLScript } from '@controllers/sql-script';
import {
  deleteTabByScriptId,
  deleteTabByConversationId,
  findTabFromScript,
  findTabFromConversation,
  getOrCreateTabFromScript,
  getOrCreateTabFromConversation,
  setActiveTabId,
  setPreviewTabId,
  deleteTab,
} from '@controllers/tab';
import {
  findTabFromComparison,
  getOrCreateTabFromComparison,
} from '@controllers/tab/comparison-tab-controller';
import { useAIChatSubscription } from '@features/ai-chat/hooks/use-ai-chat-subscription';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { RenderTreeNodePayload as MantineRenderTreeNodePayload } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ChatConversationId } from '@models/ai-chat';
import { ComparisonId } from '@models/comparison';
import { SQLScriptId } from '@models/sql-script';
import { useSqlScriptNameMap, useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { exportSingleScript } from '@utils/script-export';
import { createShareableScriptUrl } from '@utils/script-sharing';
import { memo, useMemo, useCallback, useState, useEffect } from 'react';

import { ScriptExplorerContext, ScriptNodeTypeToIdTypeMap } from './model';
import { ScriptExplorerNode } from './script-explorer-node';

// Type guards for better type safety
const isComparisonNode = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
): node is TreeNodeData<ScriptNodeTypeToIdTypeMap> & {
  nodeType: 'comparison';
  value: ComparisonId;
} => {
  return node.nodeType === 'comparison';
};

const isScriptNode = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
): node is TreeNodeData<ScriptNodeTypeToIdTypeMap> & { nodeType: 'script'; value: SQLScriptId } => {
  return node.nodeType === 'script';
};

const isAIChatNode = (
  node: TreeNodeData<ScriptNodeTypeToIdTypeMap>,
): node is TreeNodeData<ScriptNodeTypeToIdTypeMap> & {
  nodeType: 'ai-chat';
  value: ChatConversationId;
} => {
  return node.nodeType === 'ai-chat';
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
    const existingTab = findTabFromComparison(node.value);
    const tab = getOrCreateTabFromComparison(node.value, true);
    if (!existingTab) {
      setPreviewTabId(tab.id);
    }
    return;
  }

  if (isAIChatNode(node)) {
    const existingTab = findTabFromConversation(node.value);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    const tab = getOrCreateTabFromConversation(node.value, true);
    setPreviewTabId(tab.id);
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
    const tab = findTabFromComparison(node.value);
    if (tab) {
      deleteTab([tab.id]);
    }
  } else if (isAIChatNode(node)) {
    deleteTabByConversationId(node.value);
  } else if (isScriptNode(node)) {
    deleteTabByScriptId(node.value);
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
  if (node.nodeType === 'comparison' || node.nodeType === 'ai-chat') {
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

// Custom hook to get comparisons with proper memoization
// Returns an array of [id, name] tuples - only changes when comparisons are added/removed/renamed
function useComparisonsList(): ReadonlyArray<readonly [ComparisonId, string]> {
  const comparisons = useAppStore((state) => state.comparisons);

  return useMemo(
    () =>
      Array.from(comparisons.entries()).map(([id, comparison]) => [id, comparison.name] as const),
    [comparisons],
  );
}

export const ScriptExplorer = memo(() => {
  /**
   * Global state
   */
  // Subscribe to AI chat changes for live updates
  useAIChatSubscription();

  const sqlScripts = useSqlScriptNameMap();
  const comparisons = useComparisonsList();
  const pool = useInitializedDuckDBConnectionPool();

  // Local state to store conversations
  const [conversations, setConversations] = useState(() => aiChatController.getAllConversations());

  // Update when conversations change
  useEffect(() => {
    const updateConversations = () => {
      setConversations(aiChatController.getAllConversations());
    };

    // Initial load
    updateConversations();

    // Subscribe to AI chat controller changes (includes cross-tab updates)
    const unsubscribeController = aiChatController.subscribe(updateConversations);

    // Also update when app state changes
    const unsubscribeStore = useAppStore.subscribe(() => updateConversations());

    return () => {
      unsubscribeController();
      unsubscribeStore();
    };
  }, []);

  const hasActiveElement = useAppStore((state) => {
    const activeTab = state.activeTabId && state.tabs.get(state.activeTabId);
    return (
      activeTab?.type === 'script' ||
      activeTab?.type === 'comparison' ||
      activeTab?.type === 'ai-chat'
    );
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
      Array.from(comparisons).sort(([, leftName], [, rightName]) =>
        leftName.localeCompare(rightName),
      ),
    [comparisons],
  );

  const conversationsArray = useMemo(
    () =>
      conversations
        .map((conv) => {
          const lastMessage = conv.messages[conv.messages.length - 1];
          const title =
            conv.title ||
            (lastMessage?.role === 'user'
              ? lastMessage.content.slice(0, 50) + (lastMessage.content.length > 50 ? '...' : '')
              : 'New Chat');
          return [conv.id, title] as const;
        })
        .sort(([, leftName], [, rightName]) => leftName.localeCompare(rightName)),
    [conversations],
  );

  // Get all names for validation (excluding current node's name in validateRename)
  const getAllNamesExcept = useMemo(
    () => (nodeId: string) => {
      const scriptNames = scriptsArray.filter(([id]) => id !== nodeId).map(([, name]) => name);
      const comparisonNames = comparisonsArray
        .filter(([id]) => id !== nodeId)
        .map(([, name]) => name);
      const chatNames = conversationsArray
        .filter(([id]) => id !== nodeId)
        .map(([, title]) => title);
      return [...scriptNames, ...comparisonNames, ...chatNames];
    },
    [scriptsArray, comparisonsArray, conversationsArray],
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

  const handleNodeDelete = useCallback(
    async (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>) => {
      if (isComparisonNode(node)) {
        await deleteComparisons([node.value], pool).catch(() => {
          // Ignored: error handling happens via global notifications
        });
      } else if (isAIChatNode(node)) {
        // Close the tab if it's open
        deleteTabByConversationId(node.value);
        // Delete from controller
        aiChatController.deleteConversation(node.value);
        // Delete from persistent storage
        await deletePersistedConversation(node.value);
        showNotification({
          message: 'Chat conversation deleted',
          color: 'green',
        });
      } else if (isScriptNode(node)) {
        deleteSqlScripts([node.value]);
      }
    },
    [pool],
  );

  const chatContextMenu: TreeNodeMenuType<TreeNodeData<ScriptNodeTypeToIdTypeMap>> = useMemo(
    () => [
      {
        children: [
          {
            label: 'Copy title',
            onClick: (node) => {
              copyToClipboard(node.label, { showNotification: true });
            },
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
          renameComparison(node.value, newName);
        }
      },
      prepareRenameValue,
    }),
    [getAllNamesExcept],
  );

  const chatRenameCallbacks = useMemo(
    () => ({
      validateRename: createValidateRename(getAllNamesExcept),
      onRenameSubmit: async (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>, newName: string) => {
        if (isAIChatNode(node)) {
          await updatePersistedConversation(node.value, { title: newName });
          // Update the tab title if it's open
          const tab = findTabFromConversation(node.value);
          if (tab) {
            const { tabs } = useAppStore.getState();
            const newTabs = new Map(tabs);
            newTabs.set(tab.id, { ...tab });
            useAppStore.setState({ tabs: newTabs });
          }
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
            onDelete: handleNodeDelete,
            onCloseItemClick,
            contextMenu: scriptContextMenu,
            // no children
          }) as TreeNodeData<ScriptNodeTypeToIdTypeMap>,
      ),
    [scriptsArray, scriptRenameCallbacks, scriptContextMenu, handleNodeDelete],
  );

  const comparisonTree: TreeNodeData<ScriptNodeTypeToIdTypeMap>[] = useMemo(
    () =>
      comparisonsArray.map(
        ([comparisonId, comparisonName]) =>
          ({
            nodeType: 'comparison',
            value: comparisonId,
            label: comparisonName,
            iconType: 'comparison',
            isDisabled: false,
            isSelectable: true,
            onNodeClick,
            renameCallbacks: comparisonRenameCallbacks,
            onDelete: handleNodeDelete,
            onCloseItemClick,
            contextMenu: comparisonContextMenu,
            // no children
          }) as TreeNodeData<ScriptNodeTypeToIdTypeMap>,
      ),
    [comparisonsArray, comparisonRenameCallbacks, comparisonContextMenu, handleNodeDelete],
  );

  const chatTree: TreeNodeData<ScriptNodeTypeToIdTypeMap>[] = useMemo(
    () =>
      conversationsArray.map(
        ([conversationId, conversationTitle]) =>
          ({
            nodeType: 'ai-chat',
            value: conversationId,
            label: conversationTitle,
            iconType: 'ai-message',
            isDisabled: false,
            isSelectable: true,
            onNodeClick,
            renameCallbacks: chatRenameCallbacks,
            onDelete: handleNodeDelete,
            onCloseItemClick,
            contextMenu: chatContextMenu,
            // no children
          }) as TreeNodeData<ScriptNodeTypeToIdTypeMap>,
      ),
    [conversationsArray, chatRenameCallbacks, chatContextMenu, handleNodeDelete],
  );

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    [],
  );

  const allNodes = useMemo(() => {
    const getSortKey = (node: TreeNodeData<ScriptNodeTypeToIdTypeMap>) => {
      if (node.nodeType === 'script') {
        return node.label.replace(/\.sql$/, '').toLowerCase();
      }
      return node.label.toLowerCase();
    };

    return [...sqlScriptTree, ...comparisonTree, ...chatTree].sort((a, b) => {
      const order = collator.compare(getSortKey(a), getSortKey(b));
      return order !== 0 ? order : collator.compare(a.label.toLowerCase(), b.label.toLowerCase());
    });
  }, [sqlScriptTree, comparisonTree, chatTree, collator]);

  // Create Sets for efficient O(1) lookup instead of O(n) array search
  const scriptIdsSet = useMemo(() => new Set(scriptsArray.map(([id]) => id)), [scriptsArray]);
  const comparisonIdsSet = useMemo(
    () => new Set(comparisonsArray.map(([id]) => id)),
    [comparisonsArray],
  );
  const chatIdsSet = useMemo(
    () => new Set(conversationsArray.map(([id]) => id)),
    [conversationsArray],
  );

  // Memoize the delete handler to prevent unnecessary re-renders
  const handleDeleteSelected = useMemo(
    () => async (ids: (SQLScriptId | ComparisonId | ChatConversationId)[]) => {
      const scriptIds: SQLScriptId[] = [];
      const comparisonIds: ComparisonId[] = [];
      const chatIds: ChatConversationId[] = [];

      // Use Set lookups for O(1) performance instead of O(n) array.some()
      ids.forEach((id) => {
        if (scriptIdsSet.has(id as SQLScriptId)) {
          scriptIds.push(id as SQLScriptId);
        } else if (comparisonIdsSet.has(id as ComparisonId)) {
          comparisonIds.push(id as ComparisonId);
        } else if (chatIdsSet.has(id as ChatConversationId)) {
          chatIds.push(id as ChatConversationId);
        }
      });

      if (scriptIds.length > 0) {
        deleteSqlScripts(scriptIds);
      }
      if (comparisonIds.length > 0) {
        deleteComparisons(comparisonIds, pool).catch(() => {
          // Ignored: error handling happens via global notifications
        });
      }
      if (chatIds.length > 0) {
        for (const id of chatIds) {
          await deletePersistedConversation(id);
        }
        showNotification({
          message: `Deleted ${chatIds.length} conversation${chatIds.length > 1 ? 's' : ''}`,
          color: 'green',
        });
      }
    },
    [scriptIdsSet, comparisonIdsSet, chatIdsSet, pool],
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
