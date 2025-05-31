import { showAlert } from '@components/app-notifications';
import { createScriptVersionController } from '@controllers/script-version';
import { createSQLScript, updateSQLScriptContent } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { SqlEditor, SqlEditorHandle } from '@features/editor';
import {
  showAIAssistant,
  hideAIAssistant,
  isAIAssistantVisible,
} from '@features/editor/ai-assistant-tooltip';
import { convertToFlowScopeSchema } from '@features/editor/auto-complete';
import { useAppTheme } from '@hooks/use-app-theme';
import { Group, Modal } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate, useDisclosure } from '@mantine/hooks';
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

import { ScriptEditorDataStatePane, VersionHistory } from './components';

// Constants for version auto-save
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds
const AUTO_SAVE_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
const MIN_VERSION_INTERVAL_MS = 1000; // Minimum 1 second between versions

// Version tracking state
interface VersionTrackingState {
  lastContent: string;
  lastAutoSaveTime: number;
  hasUserEdited: boolean;
  lastVersionCreatedTime: number;
  isInitialized: boolean;
}

type VersionTrackingAction =
  | { type: 'INITIALIZE'; content: string }
  | { type: 'VERSION_CREATED'; content: string }
  | { type: 'USER_EDITED' }
  | { type: 'RESET' }
  | { type: 'SET_INITIALIZED'; value: boolean };

function versionTrackingReducer(
  state: VersionTrackingState,
  action: VersionTrackingAction,
): VersionTrackingState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        lastContent: action.content,
        hasUserEdited: false,
        lastVersionCreatedTime: 0,
        isInitialized: true,
      };
    case 'VERSION_CREATED':
      return {
        ...state,
        lastContent: action.content,
        lastAutoSaveTime: Date.now(),
        lastVersionCreatedTime: Date.now(),
        hasUserEdited: false, // Reset after version is created
      };
    case 'USER_EDITED':
      return {
        ...state,
        hasUserEdited: true,
      };
    case 'RESET':
      return {
        lastContent: '',
        lastAutoSaveTime: Date.now(),
        hasUserEdited: false,
        lastVersionCreatedTime: 0,
        isInitialized: false,
      };
    case 'SET_INITIALIZED':
      return {
        ...state,
        isInitialized: action.value,
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
  const [versionHistoryOpened, { open: openVersionHistory, close: closeVersionHistory }] =
    useDisclosure(false);
  const [shouldShowVersionHistory, setShouldShowVersionHistory] = useState(false);

  // Use reducer for version tracking state
  const [versionTracking, dispatchVersionTracking] = useReducer(versionTrackingReducer, {
    lastContent: sqlScript?.content || '',
    lastAutoSaveTime: Date.now(),
    hasUserEdited: false,
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
    const initializeVersions = async () => {
      if (!versionController || !sqlScript) {
        dispatchVersionTracking({ type: 'INITIALIZE', content: sqlScript?.content || '' });
        return;
      }

      try {
        // Get all versions to check if any exist
        const versions = await versionController.getVersionsByScriptId(sqlScript.id);
        const currentContent = sqlScript.content || '';

        if (versions.length > 0) {
          // Use the latest version content as baseline
          dispatchVersionTracking({ type: 'INITIALIZE', content: versions[0].content });

          // Show version history if:
          // 1. There's more than one version, OR
          // 2. There's one version but its content differs from current content
          const shouldShow =
            versions.length > 1 ||
            (versions.length === 1 && versions[0].content !== currentContent);
          setShouldShowVersionHistory(shouldShow);
        } else {
          // No versions exist yet, use current script content
          dispatchVersionTracking({ type: 'INITIALIZE', content: currentContent });
          setShouldShowVersionHistory(false);
        }
      } catch (error) {
        console.error('Failed to initialize versions:', error);
        dispatchVersionTracking({ type: 'INITIALIZE', content: sqlScript.content || '' });
        setShouldShowVersionHistory(false);
      }
    };

    // Reset version tracking state when script changes
    dispatchVersionTracking({ type: 'RESET' });
    initializeVersions();
  }, [sqlScript, versionController]);

  // Re-evaluate whether to show version history when content changes
  useEffect(() => {
    const checkVersionHistoryVisibility = async () => {
      if (!versionController || !sqlScript) return;

      try {
        const versions = await versionController.getVersionsByScriptId(sqlScript.id);
        const currentContent =
          editorRef.current?.editor?.getModel()?.getValue() || sqlScript.content || '';

        // Show version history if:
        // 1. There's more than one version, OR
        // 2. There's one version but its content differs from current content
        const shouldShow =
          versions.length > 1 || (versions.length === 1 && versions[0].content !== currentContent);
        setShouldShowVersionHistory(shouldShow);
      } catch (error) {
        console.error('Failed to check version history visibility:', error);
      }
    };

    // Only check after initialization is complete
    if (versionTracking.isInitialized) {
      checkVersionHistoryVisibility();
    }
  }, [sqlScript?.content, versionController, sqlScript?.id, versionTracking.isInitialized]);

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
    async (type: 'auto' | 'run' | 'manual' = 'auto') => {
      // Don't create versions until initialization is complete
      if (!versionController || !versionTracking.isInitialized) {
        return;
      }

      const currentContent = editorRef.current?.editor?.getModel()?.getValue() || '';

      const now = Date.now();
      const timeSinceLastVersion = now - versionTracking.lastVersionCreatedTime;

      // Prevent rapid version creation (minimum 1 second between versions)
      if (timeSinceLastVersion < MIN_VERSION_INTERVAL_MS && type === 'auto') {
        return;
      }

      // Only create version if content has changed
      if (currentContent === versionTracking.lastContent) {
        return;
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
      } catch (error) {
        console.error('Failed to create version:', error);
        // Show non-intrusive notification for auto-save failures
        if (type === 'auto') {
          showAlert({
            title: 'Auto-save failed',
            message: 'Your changes are still in the editor but could not be saved to history',
            color: 'yellow',
            autoClose: 5000,
          });
        }
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

  const latestValueRef = useRef(sqlScript?.content || '');

  useEffect(() => {
    latestValueRef.current = sqlScript?.content || '';
  }, [sqlScript?.content]);

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
  }, 300);

  const onSqlEditorChange = (content: string) => {
    latestValueRef.current = content;
    if (lastExecutedContent) {
      setDirty(content !== lastExecutedContent);
    }
    // Mark that user has edited
    dispatchVersionTracking({ type: 'USER_EDITED' });
    handleEditorValueChange(content);
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  const handleRestoreVersion = (version: ScriptVersion) => {
    const editor = editorRef.current?.editor;
    const model = editor?.getModel();
    if (!editor || !model) return;

    // Update the editor content
    model.setValue(version.content);

    // Update version tracking with the restored content
    dispatchVersionTracking({ type: 'VERSION_CREATED', content: version.content });
    latestValueRef.current = version.content;

    // Save the restored content
    updateSQLScriptContent(sqlScript, version.content);

    // Close the modal
    closeVersionHistory();

    showAlert({
      title: 'Version Restored',
      message: `Restored version from ${new Date(version.timestamp).toLocaleString()}`,
      autoClose: 3000,
    });
  };

  // Use ref to capture latest values for cleanup without causing re-renders
  const cleanupRef = useRef<{
    versionTracking: typeof versionTracking;
    sqlScript: typeof sqlScript;
  }>({
    versionTracking,
    sqlScript,
  });

  cleanupRef.current = {
    versionTracking,
    sqlScript,
  };

  // Create version on unmount/tab close
  useEffect(() => {
    return () => {
      const currentScript = latestValueRef.current;
      if (currentScript !== sqlScript?.content) {
        handleQuerySave(currentScript);
      }

      // Also create version on cleanup if content changed
      const { current } = cleanupRef;
      if (current && current.versionTracking.isInitialized && versionController) {
        const { versionTracking: vt, sqlScript: script } = current;
        if (currentScript && currentScript !== vt.lastContent && script) {
          // Fire and forget - we can't wait for async in cleanup
          versionController
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
      }
    };
  }, [sqlScript?.content, sqlScript?.id, handleQuerySave, versionController]);

  // Auto-save version every 30 seconds of active editing
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastSave = now - versionTracking.lastAutoSaveTime;

      // Only create auto-save if:
      // 1. Enough time has passed
      // 2. Tab is active
      // 3. Initialization is complete
      // 4. User has actually edited something
      if (
        timeSinceLastSave > AUTO_SAVE_INTERVAL_MS &&
        active &&
        versionTracking.isInitialized &&
        versionTracking.hasUserEdited
      ) {
        createVersion('auto');
      }
    }, AUTO_SAVE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    active,
    createVersion,
    versionTracking.isInitialized,
    versionTracking.hasUserEdited,
    versionTracking.lastAutoSaveTime,
  ]);

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

  useDidUpdate(() => {
    if (active) {
      editorRef.current?.editor?.focus();
    } else {
      // Tab became inactive - save version if content changed
      const currentContent = editorRef.current?.editor?.getModel()?.getValue() || '';
      if (
        currentContent &&
        currentContent !== versionTracking.lastContent &&
        versionTracking.isInitialized
      ) {
        createVersion('auto');
      }
    }
  }, [active, createVersion, versionTracking.lastContent, versionTracking.isInitialized]);

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
    <>
      <div
        className="h-full"
        data-testid={setDataTestId('query-editor')}
        data-active-editor={!!active}
      >
        <ScriptEditorDataStatePane
          dirty={dirty}
          handleRunQuery={handleRunQuery}
          scriptState={scriptState}
          onAIAssistantClick={handleAIAssistantClick}
          onOpenVersionHistory={shouldShowVersionHistory ? openVersionHistory : undefined}
        />

        <Group className="h-[calc(100%-40px)]">
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
                // Create a manual version on Cmd+S
                createVersion('manual');
                showAlert({
                  title: 'Version saved',
                  message: 'A new version has been created for your script.',
                  autoClose: 3000,
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
      </div>

      <Modal
        opened={versionHistoryOpened}
        onClose={closeVersionHistory}
        title=""
        size="xl"
        styles={{
          body: {
            padding: 0,
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          header: { display: 'none' },
          content: {
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
        data-testid={setDataTestId('version-history-modal')}
      >
        <VersionHistory
          scriptId={scriptId}
          onRestore={handleRestoreVersion}
          onClose={closeVersionHistory}
        />
      </Modal>
    </>
  );
};
