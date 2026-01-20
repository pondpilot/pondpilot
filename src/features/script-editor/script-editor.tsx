import { showAlert } from '@components/app-notifications';
import {
  ALERT_TIMING,
  EDITOR_SAVE_DEBOUNCE_MS,
  MIN_VERSION_INTERVAL_MS,
} from '@consts/version-history';
import { createScriptVersionController } from '@controllers/script-version';
import { createSQLScript, updateSQLScriptContent } from '@controllers/sql-script';
import {
  getOrCreateTabFromScript,
  removeLiveScriptContentSnapshot,
  tabsBeingDeleted,
  updateLiveScriptContentSnapshot,
} from '@controllers/tab';
import { SqlEditor, SqlEditorHandle } from '@features/editor';
import {
  showAIAssistant,
  hideAIAssistant,
  isAIAssistantVisible,
} from '@features/editor/ai-assistant-tooltip';
import { convertToFlowScopeSchema } from '@features/editor/auto-complete';
import { useAppTheme } from '@hooks/use-app-theme';
import { Group } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { ScriptVersion } from '@models/script-version';
import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore, useDuckDBFunctions } from '@store/app-store';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { getScriptMetadata } from '@utils/script-version';
import { setDataTestId } from '@utils/test-id';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ScriptEditorDataStatePane } from './components';
import { VersionHistorySidebar, VersionDiffEditor } from './components/version-history';

// Version tracking state - tracks content and timing for version creation
interface VersionTrackingState {
  lastContent: string;
  lastVersionCreatedTime: number;
  isInitialized: boolean;
}

type VersionTrackingAction =
  | { type: 'INITIALIZE'; content: string }
  | { type: 'VERSION_CREATED'; content: string }
  | { type: 'RESET' };

function versionTrackingReducer(
  state: VersionTrackingState,
  action: VersionTrackingAction,
): VersionTrackingState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        lastContent: action.content,
        lastVersionCreatedTime: 0,
        isInitialized: true,
      };
    case 'VERSION_CREATED':
      return {
        ...state,
        lastContent: action.content,
        lastVersionCreatedTime: Date.now(),
      };
    case 'RESET':
      return {
        lastContent: '',
        lastVersionCreatedTime: 0,
        isInitialized: false,
      };
    default:
      return state;
  }
}

interface ScriptEditorProps {
  id: SQLScriptId;
  scriptState: ScriptExecutionState;

  active?: boolean;

  runScriptQuery: (query: string) => Promise<void>;
}

export const ScriptEditor = ({
  id: scriptId,
  active,
  runScriptQuery,
  scriptState,
}: ScriptEditorProps) => {
  /**
   * Common hooks
   */
  const colorScheme = useAppTheme();

  const sqlScript = useAppStore((state) => state.sqlScripts.get(scriptId)!);
  const databaseMetadata = useAppStore.use.databaseMetadata();
  const databaseModelsArray = Array.from(databaseMetadata.values());
  const iDbConn = useAppStore((state) => state._iDbConn);

  /**
   * State
   */
  const editorRef = useRef<SqlEditorHandle | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastExecutedContent, setLastExecutedContent] = useState('');
  const [shouldShowVersionHistory, setShouldShowVersionHistory] = useState(false);

  // History mode state (sidebar)
  const [historyMode, setHistoryMode] = useState(false);
  const [selectedVersionForDiff, setSelectedVersionForDiff] = useState<ScriptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<ScriptVersion | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);

  // Ref to hold the rename handler from VersionHistorySidebar.
  // The sidebar populates this ref, and the top bar invokes it via handleRenameVersion.
  // This pattern enables communication between sibling components without lifting state.
  const renameVersionHandlerRef = useRef<((version: ScriptVersion) => void) | null>(null);

  // Ref to track the latest editor content - used for visibility checks
  const latestValueRef = useRef(sqlScript?.content || '');

  const updateLatestEditorValue = useCallback(
    (value: string) => {
      latestValueRef.current = value;
      updateLiveScriptContentSnapshot(scriptId, value);
    },
    [scriptId],
  );

  // Use reducer for version tracking state
  const [versionTracking, dispatchVersionTracking] = useReducer(versionTrackingReducer, {
    lastContent: sqlScript?.content || '',
    lastVersionCreatedTime: 0,
    isInitialized: false,
  });

  // Create version controller
  const versionController = useMemo(() => {
    if (!iDbConn) return null;
    return createScriptVersionController(iDbConn);
  }, [iDbConn]);

  // Initialize versions once on mount/script change
  useEffect(() => {
    let didCancel = false;

    const initializeVersions = async () => {
      const currentScript = useAppStore.getState().sqlScripts.get(scriptId);

      if (!versionController || !currentScript) {
        if (!didCancel) {
          dispatchVersionTracking({ type: 'INITIALIZE', content: currentScript?.content || '' });
          setShouldShowVersionHistory(false);
        }
        return;
      }

      try {
        const versions = await versionController.getVersionsByScriptId(scriptId);
        if (didCancel) {
          return;
        }

        const currentContent = currentScript.content || '';

        if (versions.length > 0) {
          dispatchVersionTracking({ type: 'INITIALIZE', content: versions[0].content });

          setShouldShowVersionHistory(versions.length > 0);
        } else {
          dispatchVersionTracking({ type: 'INITIALIZE', content: currentContent });
          setShouldShowVersionHistory(false);
        }
      } catch (error) {
        if (didCancel) {
          return;
        }
        console.error('Failed to initialize versions:', error);
        dispatchVersionTracking({
          type: 'INITIALIZE',
          content: useAppStore.getState().sqlScripts.get(scriptId)?.content || '',
        });
        setShouldShowVersionHistory(false);
      }
    };

    dispatchVersionTracking({ type: 'RESET' });
    initializeVersions();

    return () => {
      didCancel = true;
    };
  }, [scriptId, versionController]);

  // Get the DuckDB functions from the store
  const duckDBFunctions = useDuckDBFunctions();

  // Convert functions to tooltip format
  const functionTooltips = useMemo(() => {
    // Use store functions if available
    if (duckDBFunctions.length > 0) {
      return convertFunctionsToTooltips(duckDBFunctions);
    }
    return {};
  }, [duckDBFunctions]);

  // Get the tab ID from the script
  const tabId = useAppStore((state) => {
    for (const [tId, tab] of state.tabs) {
      if (tab.type === 'script' && tab.sqlScriptId === scriptId) {
        return tId;
      }
    }
    return null;
  });

  const schema = useMemo(
    () => convertToFlowScopeSchema(databaseModelsArray),
    [databaseModelsArray],
  );

  /**
   * Handlers
   */
  const createVersion = useCallback(
    async (type: 'auto' | 'run' | 'manual' = 'auto'): Promise<boolean> => {
      // For auto-saves, wait for initialization to complete
      // For manual saves and run versions, allow creation even if not fully initialized
      if (!versionController) {
        return false;
      }
      if (!versionTracking.isInitialized && type === 'auto') {
        return false;
      }

      const currentContent =
        editorRef.current?.editor?.getModel()?.getValue() || latestValueRef.current || '';

      const now = Date.now();
      const timeSinceLastVersion = now - versionTracking.lastVersionCreatedTime;

      // Prevent rapid version creation (minimum 1 second between versions)
      if (timeSinceLastVersion < MIN_VERSION_INTERVAL_MS && type === 'auto') {
        return false;
      }

      // Only create version if content has changed
      if (currentContent === versionTracking.lastContent) {
        return false;
      }

      try {
        await versionController.createVersion({
          scriptId,
          content: currentContent,
          type,
          metadata: getScriptMetadata(currentContent),
        });

        dispatchVersionTracking({ type: 'VERSION_CREATED', content: currentContent });

        // Always show version history after creating a version
        // (since now we have at least one version that may differ from current content)
        setShouldShowVersionHistory(true);
        return true;
      } catch (error) {
        console.error('Failed to create version:', error);
        // Show non-intrusive notification for auto-save failures
        if (type === 'auto') {
          showAlert({
            title: 'Auto-save failed',
            message: 'Your changes are still in the editor but could not be saved to history',
            color: 'yellow',
            autoClose: ALERT_TIMING.LONG,
          });
        }
        return false;
      }
    },
    [
      scriptId,
      versionController,
      versionTracking.isInitialized,
      versionTracking.lastContent,
      versionTracking.lastVersionCreatedTime,
    ],
  );

  const handleRunQuery = async (mode?: RunScriptMode) => {
    const editorHandle = editorRef.current;
    const editor = editorHandle?.editor;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const selection = editor.getSelection();
    const position = selection?.getPosition() ?? editor.getPosition();
    const cursorOffset = position ? model.getOffsetAt(position) : 0;

    const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : '';

    let statementText = '';
    if (!selectedText && editorHandle?.getStatementRangeAtOffset) {
      const range = editorHandle.getStatementRangeAtOffset(cursorOffset);
      if (range) {
        const startPos = model.getPositionAt(range.start);
        const endPos = model.getPositionAt(range.end);
        statementText = model.getValueInRange(
          new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        );
      }
    }

    const fullQuery = model.getValue();
    const queryToRun =
      mode === 'selection' ? selectedText || statementText || fullQuery : fullQuery;

    // Create a version before running the query
    await createVersion('run');

    setLastExecutedContent(fullQuery);
    setDirty(false);
    runScriptQuery(queryToRun);
  };

  useEffect(() => {
    updateLatestEditorValue(sqlScript?.content || '');
  }, [sqlScript?.content, updateLatestEditorValue]);

  useEffect(() => {
    return () => {
      removeLiveScriptContentSnapshot(scriptId);
    };
  }, [scriptId]);

  const handleQuerySave = useCallback(
    async (content?: string) => {
      const nextContent = content ?? latestValueRef.current;
      updateSQLScriptContent(sqlScript, nextContent);
    },
    [sqlScript],
  );

  // Use a ref to ensure debounced callback always uses the latest handleQuerySave
  const handleQuerySaveRef = useRef(handleQuerySave);
  useEffect(() => {
    handleQuerySaveRef.current = handleQuerySave;
  }, [handleQuerySave]);

  const handleEditorValueChange = useDebouncedCallback(async (content: string) => {
    await handleQuerySaveRef.current(content);
  }, EDITOR_SAVE_DEBOUNCE_MS);

  // Cancel pending debounced calls on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      handleEditorValueChange.cancel();
    };
  }, [handleEditorValueChange]);

  const handleEnterHistoryMode = useCallback(async () => {
    const currentValue =
      editorRef.current?.editor?.getModel()?.getValue() ?? latestValueRef.current;
    updateLatestEditorValue(currentValue);

    try {
      await handleQuerySave(currentValue);
    } catch (error) {
      console.error('Failed to sync editor content before entering history mode:', error);
    }

    // Reset selection state when entering
    setSelectedVersionForDiff(null);
    setCompareVersion(null);
    setIsCompareMode(false);
    setHistoryMode(true);
  }, [handleQuerySave, updateLatestEditorValue]);

  const handleExitHistoryMode = useCallback(() => {
    setHistoryMode(false);
    setSelectedVersionForDiff(null);
    setCompareVersion(null);
    setIsCompareMode(false);
  }, []);

  const handleToggleCompareMode = useCallback(() => {
    setIsCompareMode((prev) => !prev);
    setCompareVersion(null);
  }, []);

  const onSqlEditorChange = (content: string) => {
    updateLatestEditorValue(content);
    if (lastExecutedContent) {
      setDirty(content !== lastExecutedContent);
    }
    handleEditorValueChange(content);
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  const handleRestoreVersion = useCallback(
    (version: ScriptVersion) => {
      // Update version tracking with the restored content
      dispatchVersionTracking({ type: 'VERSION_CREATED', content: version.content });
      updateLatestEditorValue(version.content);

      // Save the restored content to the store
      // The SqlEditor will pick up this content when it remounts after exiting history mode
      updateSQLScriptContent(sqlScript, version.content);

      // Exit history mode - SqlEditor will remount with the restored content
      handleExitHistoryMode();

      showAlert({
        title: 'Version Restored',
        message: `Restored version from ${new Date(version.timestamp).toLocaleString()}`,
        autoClose: ALERT_TIMING.MEDIUM,
      });
    },
    [handleExitHistoryMode, sqlScript, updateLatestEditorValue],
  );

  const handleRenameVersion = useCallback((version: ScriptVersion) => {
    // Delegate to the sidebar's rename handler
    renameVersionHandlerRef.current?.(version);
  }, []);

  // Use ref to capture latest values for cleanup without causing re-renders
  const cleanupRef = useRef<{
    versionTracking: typeof versionTracking;
    sqlScript: typeof sqlScript;
    tabId: typeof tabId;
  }>({
    versionTracking,
    sqlScript,
    tabId,
  });

  cleanupRef.current = {
    versionTracking,
    sqlScript,
    tabId,
  };

  const versionControllerRef = useRef(versionController);
  useEffect(() => {
    versionControllerRef.current = versionController;
  }, [versionController]);

  // On unmount:
  // 1. Persist any unsaved editor content to storage.
  // 2. If version tracking is initialized and the tab still exists,
  //    create an "auto" version if content differs from last saved version.
  //
  // COORDINATION NOTE: This effect coordinates with deleteTab() in tab-controller.ts.
  // When a tab is explicitly closed via deleteTab(), that function handles version creation.
  // We check tabsBeingDeleted to avoid duplicate version creation. The flow is:
  //   - deleteTab adds tab to tabsBeingDeleted
  //   - deleteTab creates version, removes tab from store
  //   - React unmounts ScriptEditor, this cleanup runs
  //   - Cleanup skips version creation (tab is in tabsBeingDeleted or no longer exists)
  //   - deleteTab removes tab from tabsBeingDeleted in finally block
  //
  // Uses refs to access latest state without causing effect re-runs.
  useEffect(() => {
    return () => {
      const currentScript = latestValueRef.current;
      const { current: cleanupState } = cleanupRef;

      if (!cleanupState) {
        return;
      }

      // Persist any unsaved content
      if (cleanupState.sqlScript && currentScript !== cleanupState.sqlScript.content) {
        handleQuerySaveRef.current(currentScript).catch((err) => {
          console.error('Failed to persist content:', err);
        });
      }

      // Create version on cleanup if content changed and tab still exists
      const controller = versionControllerRef.current;
      if (!controller || !cleanupState.versionTracking.isInitialized) {
        return;
      }

      // Check if this tab is being explicitly deleted via deleteTab.
      // If so, deleteTab handles version creation, so we skip here to avoid duplicates.
      if (cleanupState.tabId && tabsBeingDeleted.has(cleanupState.tabId)) {
        return;
      }

      const tabStillExists =
        cleanupState.tabId == null || useAppStore.getState().tabs.has(cleanupState.tabId);

      // When the tab is being closed we rely on deleteTab to create the version
      if (!tabStillExists) {
        return;
      }

      const { versionTracking: vt, sqlScript: script } = cleanupState;
      if (currentScript !== vt.lastContent && script) {
        // Fire and forget - we can't wait for async in cleanup
        controller
          .createVersion({
            scriptId: script.id,
            content: currentScript,
            type: 'auto',
            metadata: getScriptMetadata(currentScript),
          })
          .catch((err) => {
            console.error('Failed to create version on cleanup:', err);
          });
      }
    };
  }, []);

  // Listen for AI Assistant trigger event
  useEffect(() => {
    const handleTriggerAIAssistant = (event: CustomEvent) => {
      const { editor } = editorRef.current ?? {};
      if (event.detail.tabId === tabId && editor && tabId) {
        const { tabExecutionErrors } = useAppStore.getState();
        const errorContext = tabExecutionErrors.get(tabId);
        showAIAssistant(editor, errorContext);
      }
    };

    window.addEventListener('trigger-ai-assistant', handleTriggerAIAssistant as EventListener);

    return () => {
      window.removeEventListener('trigger-ai-assistant', handleTriggerAIAssistant as EventListener);
    };
  }, [tabId]);

  // Handle Escape key to exit history mode.
  // Don't exit if a modal is open (e.g., rename dialog) - let the modal handle Escape.
  useEffect(() => {
    if (!historyMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Check if focus is inside a modal - if so, let the modal handle Escape
        const modalContainer = document.querySelector('.mantine-Modal-root');
        if (modalContainer?.contains(e.target as Node)) {
          return;
        }

        e.preventDefault();
        handleExitHistoryMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyMode, handleExitHistoryMode]);

  useDidUpdate(() => {
    if (active) {
      editorRef.current?.editor?.focus();
    }
  }, [active]);

  const handleAIAssistantClick = () => {
    const { editor } = editorRef.current ?? {};
    if (editor && tabId) {
      if (isAIAssistantVisible(editor)) {
        hideAIAssistant(editor);
      } else {
        const { tabExecutionErrors } = useAppStore.getState();
        const errorContext = tabExecutionErrors.get(tabId);
        showAIAssistant(editor, errorContext);
      }
    }
  };

  return (
    <div
      className="h-full flex"
      data-testid={setDataTestId('query-editor')}
      data-active-editor={!!active}
    >
      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ScriptEditorDataStatePane
          dirty={dirty}
          handleRunQuery={handleRunQuery}
          scriptState={scriptState}
          onAIAssistantClick={handleAIAssistantClick}
          historyMode={historyMode}
          onEnterHistoryMode={shouldShowVersionHistory ? handleEnterHistoryMode : undefined}
          onExitHistoryMode={handleExitHistoryMode}
          selectedVersion={selectedVersionForDiff}
          onRestoreVersion={handleRestoreVersion}
          onRenameVersion={handleRenameVersion}
        />

        <div className="flex-1 h-[calc(100%-40px)]">
          {historyMode ? (
            <VersionDiffEditor
              currentContent={latestValueRef.current}
              selectedVersion={selectedVersionForDiff}
              compareVersion={compareVersion}
            />
          ) : (
            <Group className="h-full">
              <SqlEditor
                onBlur={handleQuerySave}
                ref={editorRef}
                colorSchemeDark={colorScheme === 'dark'}
                value={sqlScript?.content || ''}
                onChange={onSqlEditorChange}
                schema={schema}
                functionTooltips={functionTooltips}
                path={sqlScript?.id ? String(sqlScript.id) : tabId ? String(tabId) : undefined}
                onRun={() => {
                  handleRunQuery().catch((error) => {
                    console.warn('Run query failed:', error);
                  });
                }}
                onRunSelection={() => {
                  handleRunQuery('selection').catch((error) => {
                    console.warn('Run selection failed:', error);
                  });
                }}
                onKeyDown={(e: monaco.IKeyboardEvent) => {
                  if (KEY_BINDING.save.match(e)) {
                    handleQuerySave().catch((error) => {
                      console.warn('Save query failed:', error);
                    });
                    // Create a manual version on Cmd+S and show feedback based on result
                    createVersion('manual').then((success) => {
                      if (success) {
                        showAlert({
                          title: 'Version saved',
                          message: 'A new version has been created for your script.',
                          autoClose: ALERT_TIMING.MEDIUM,
                        });
                      } else {
                        // Version not created (no changes or error) - still acknowledge save
                        showAlert({
                          title: 'Script saved',
                          message: 'No changes to save to version history.',
                          autoClose: ALERT_TIMING.SHORT,
                        });
                      }
                    });
                    e.preventDefault();
                    e.stopPropagation();
                  } else if (KEY_BINDING.kmenu.match(e)) {
                    Spotlight.open();
                  } else if (KEY_BINDING.openNewScript.match(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddScript();
                  }
                }}
              />
            </Group>
          )}
        </div>
      </div>

      {/* Version History Sidebar */}
      {historyMode && (
        <VersionHistorySidebar
          scriptId={scriptId}
          selectedVersion={selectedVersionForDiff}
          compareVersion={compareVersion}
          isCompareMode={isCompareMode}
          onSelectVersion={setSelectedVersionForDiff}
          onSelectCompareVersion={setCompareVersion}
          onToggleCompareMode={handleToggleCompareMode}
          onRestore={handleRestoreVersion}
          onClose={handleExitHistoryMode}
          onHistoryCleared={() => setShouldShowVersionHistory(false)}
          renameHandlerRef={renameVersionHandlerRef}
        />
      )}
    </div>
  );
};
