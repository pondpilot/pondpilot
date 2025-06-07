import { Group, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useEffect, useRef, useState, useMemo } from 'react';

import { showAlert } from '@components/app-notifications';
import { createSQLScript, updateSQLScriptContent } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { SqlEditor } from '@features/editor';
import { showAIAssistant } from '@features/editor/ai-assistant-tooltip';
import { convertToSQLNamespace, createDuckDBCompletions } from '@features/editor/auto-complete';
import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore, useDuckDBFunctions } from '@store/app-store';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { splitSqlQuery } from '@utils/editor/statement-parser';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { setDataTestId } from '@utils/test-id';

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
  const { colorScheme } = useMantineColorScheme();

  const sqlScript = useAppStore((state) => state.sqlScripts.get(scriptId)!);
  const dataBaseMetadata = useAppStore.use.dataBaseMetadata();
  const databaseModelsArray = Array.from(dataBaseMetadata.values());

  /**
   * State
   */
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [fontSize, setFontSize] = useState(0.875);
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

    setLastExecutedContent(fullQuery);
    setDirty(false);
    runScriptQuery(queryToRun);
  };

  const handleQuerySave = async () => {
    updateSQLScriptContent(sqlScript, editorRef.current?.view?.state?.doc.toString() || '');
  };

  const handleEditorValueChange = useDebouncedCallback(async () => {
    handleQuerySave();
  }, 300);

  const onSqlEditorChange = () => {
    const currentContent = editorRef.current?.view?.state?.doc.toString() || '';
    if (lastExecutedContent) {
      setDirty(currentContent !== lastExecutedContent);
    }
    handleEditorValueChange();
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  useEffect(() => {
    return () => {
      if (editorRef.current?.view) {
        const editor = editorRef.current.view;
        const currentScript = editor.state.doc.toString();
        if (currentScript !== sqlScript?.content) {
          handleQuerySave();
        }
      }
    };
  }, []);

  // Listen for AI Assistant trigger event
  useEffect(() => {
    const handleTriggerAIAssistant = (event: CustomEvent) => {
      if (event.detail.tabId === tabId && editorRef.current?.view && tabId) {
        const { tabExecutionErrors } = useAppStore.getState();
        const errorContext = tabExecutionErrors.get(tabId);
        showAIAssistant(editorRef.current.view, errorContext);
      }
    };

    window.addEventListener('trigger-ai-assistant', handleTriggerAIAssistant as EventListener);

    return () => {
      window.removeEventListener('trigger-ai-assistant', handleTriggerAIAssistant as EventListener);
    };
  }, [tabId]);

  useDidUpdate(() => {
    if (active) {
      editorRef.current?.view?.focus();
    }
  }, [active]);

  const handleAIAssistantClick = () => {
    if (editorRef.current?.view && tabId) {
      const { tabExecutionErrors } = useAppStore.getState();
      const errorContext = tabExecutionErrors.get(tabId);
      showAIAssistant(editorRef.current.view, errorContext);
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
