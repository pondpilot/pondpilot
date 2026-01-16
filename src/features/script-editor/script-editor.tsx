import { showAlert } from '@components/app-notifications';
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
import { Group } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore, useDuckDBFunctions } from '@store/app-store';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { setDataTestId } from '@utils/test-id';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ScriptEditorDataStatePane } from './components';

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

  /**
   * State
   */
  const editorRef = useRef<SqlEditorHandle | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastExecutedContent, setLastExecutedContent] = useState('');

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
    handleEditorValueChange(content);
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  useEffect(() => {
    return () => {
      const currentScript = latestValueRef.current;
      if (currentScript !== sqlScript?.content) {
        handleQuerySave(currentScript);
      }
    };
  }, [sqlScript?.content, handleQuerySave]);

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
      className="h-full"
      data-testid={setDataTestId('query-editor')}
      data-active-editor={!!active}
    >
      <ScriptEditorDataStatePane
        dirty={dirty}
        handleRunQuery={handleRunQuery}
        scriptState={scriptState}
        onAIAssistantClick={handleAIAssistantClick}
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
          onKeyDown={(e: monaco.IKeyboardEvent) => {
            if (KEY_BINDING.run.match(e)) {
              if (KEY_BINDING.runSelection.match(e)) {
                handleRunQuery('selection').catch((error) => {
                  console.warn('Run selection failed:', error);
                });
              } else {
                handleRunQuery().catch((error) => {
                  console.warn('Run query failed:', error);
                });
              }
              e.preventDefault();
            } else if (KEY_BINDING.save.match(e)) {
              handleQuerySave().catch((error) => {
                console.warn('Save query failed:', error);
              });
              showAlert({
                title: 'Auto-save enabled',
                message:
                  "Your changes are always saved automatically. You don't need to press 'Save' manually.",
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
  );
};
