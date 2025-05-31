import { showAlert } from '@components/app-notifications';
import { createScriptVersionController } from '@controllers/script-version';
import { createSQLScript, updateSQLScriptContent } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { SqlEditor } from '@features/editor';
import { convertToSQLNamespace, createDuckDBCompletions } from '@features/editor/auto-complete';
import { Group, Modal, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate, useDisclosure } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { ScriptVersion } from '@models/script-version';
import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore, useDuckDBFunctions } from '@store/app-store';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { splitSqlQuery } from '@utils/editor/statement-parser';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { getScriptMetadata } from '@utils/script-version';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useRef, useState, useMemo, useCallback, useReducer } from 'react';

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

export const ScriptEditor = ({ id, active, runScriptQuery, scriptState }: ScriptEditorProps) => {
  /**
   * Common hooks
   */
  const { colorScheme } = useMantineColorScheme();

  const sqlScript = useAppStore((state) => state.sqlScripts.get(id)!);
  const dataBaseMetadata = useAppStore.use.dataBaseMetadata();
  const databaseModelsArray = Array.from(dataBaseMetadata.values());
  const iDbConn = useAppStore((state) => state._iDbConn);

  /**
   * State
   */
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [fontSize, setFontSize] = useState(0.875);
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
          editorRef.current?.view?.state?.doc.toString() || sqlScript.content || '';

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

  const sqlNamespace = useMemo(
    () => convertToSQLNamespace(databaseModelsArray),
    [databaseModelsArray],
  );
  const duckdbNamespace = useMemo(
    () => createDuckDBCompletions(functionTooltips),
    [functionTooltips],
  );
  const schema = useMemo(
    () => ({
      ...duckdbNamespace,
      ...sqlNamespace,
    }),
    [duckdbNamespace, sqlNamespace],
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

      const currentContent = editorRef.current?.view?.state?.doc.toString() || '';

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
          scriptId: id,
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
      id,
      versionController,
      versionTracking.isInitialized,
      versionTracking.lastContent,
      versionTracking.lastVersionCreatedTime,
    ],
  );

  const handleRunQuery = async (mode?: RunScriptMode) => {
    const editor = editorRef.current?.view;
    if (!editor?.state) return;

    const getCurrentStatement = () => {
      const cursor = editor.state.selection.main.head;
      const statementSegments = splitSqlQuery(editor.state);
      const currentStatement = statementSegments.find(
        (segment) => cursor >= segment.from && cursor <= segment.to,
      );
      return currentStatement;
    };

    const getSelectedText = () => {
      const { from } = editor.state.selection.ranges[0];
      const { to } = editor.state.selection.ranges[0];
      if (from === to) return getCurrentStatement()?.text || '';
      return editor.state.doc.sliceString(from, to) || '';
    };

    const fullQuery = editor.state.doc.toString();
    const selectedText = getSelectedText();

    const queryToRun = mode === 'selection' ? selectedText : fullQuery;

    // Create a version before running the query
    await createVersion('run');

    setLastExecutedContent(fullQuery);
    setDirty(false);
    runScriptQuery(queryToRun);
  };

  const handleQuerySave = useCallback(async () => {
    updateSQLScriptContent(sqlScript, editorRef.current?.view?.state?.doc.toString() || '');
  }, [sqlScript]);

  const handleEditorValueChange = useDebouncedCallback(async () => {
    handleQuerySave();
  }, 300);

  const onSqlEditorChange = () => {
    const currentContent = editorRef.current?.view?.state?.doc.toString() || '';
    if (lastExecutedContent) {
      setDirty(currentContent !== lastExecutedContent);
    }
    // Mark that user has edited
    dispatchVersionTracking({ type: 'USER_EDITED' });
    handleEditorValueChange();
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  const handleRestoreVersion = (version: ScriptVersion) => {
    if (!editorRef.current?.view) return;

    // Update the editor content
    const { view } = editorRef.current;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: version.content,
      },
    });

    // Update version tracking with the restored content
    dispatchVersionTracking({ type: 'VERSION_CREATED', content: version.content });

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
    createVersion: typeof createVersion;
  }>({
    versionTracking,
    sqlScript,
    createVersion,
  });

  cleanupRef.current = {
    versionTracking,
    sqlScript,
    createVersion,
  };

  // Create version on unmount/tab close
  useEffect(() => {
    // We'll use a synchronous approach for cleanup
    return () => {
      // Get the latest values from the ref
      const { current } = cleanupRef;
      if (!current) return;

      const { versionTracking: vt, sqlScript: script } = current;

      // Capture current editor content at cleanup time - copy ref to local variable
      const editorView = editorRef.current?.view;
      if (editorView && vt && vt.isInitialized && script) {
        const currentContent = editorView.state.doc.toString();

        // Save script content first if changed
        if (currentContent && currentContent !== script.content) {
          updateSQLScriptContent(script, currentContent);
        }

        // Create version synchronously using the controller directly
        if (currentContent && currentContent !== vt.lastContent && versionController) {
          // Fire and forget - we can't wait for async in cleanup
          versionController
            .createVersion({
              scriptId: script.id,
              content: currentContent,
              type: 'auto',
              metadata: getScriptMetadata(currentContent),
            })
            .catch((err) => {
              console.error('Failed to create version on cleanup:', err);
            });
        }
      }
    };
  }, [sqlScript?.id, versionController]); // Only depend on script ID and controller

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

  useDidUpdate(() => {
    if (active) {
      editorRef.current?.view?.focus();
    } else {
      // Tab became inactive - save version if content changed
      const currentContent = editorRef.current?.view?.state?.doc.toString() || '';
      if (
        currentContent &&
        currentContent !== versionTracking.lastContent &&
        versionTracking.isInitialized
      ) {
        createVersion('auto');
      }
    }
  }, [active]);

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
            fontSize={fontSize}
            onFontSizeChanged={setFontSize}
            functionTooltips={functionTooltips}
            onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
              if (KEY_BINDING.run.match(e)) {
                if (KEY_BINDING.runSelection.match(e)) {
                  handleRunQuery('selection');
                } else {
                  handleRunQuery();
                }
                e.preventDefault();
              } else if (KEY_BINDING.save.match(e)) {
                handleQuerySave();
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
          scriptId={id}
          onRestore={handleRestoreVersion}
          onClose={closeVersionHistory}
        />
      </Modal>
    </>
  );
};
