import { showAlert } from '@components/app-notifications';
import { createSQLScript, updateSQLScriptContent } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { convertToSQLNamespace } from '@features/editor/auto-complete';
import { SqlEditor } from '@features/editor/monaco-sql-editor';
import { Group, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback, useDidUpdate } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

import { ScriptEditorDataStatePane } from './components';

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
  const duckdbFunctionList = useAppStore.use.duckdbFunctionList();
  // eslint-disable-next-line no-console
  console.log('duckdbFunctionList from store:', duckdbFunctionList);

  /**
   * State
   */
  const editorRef = useRef<any>(null);
  const [fontSize, setFontSize] = useState(0.875);
  const [dirty, setDirty] = useState(false);
  const [lastExecutedContent, setLastExecutedContent] = useState('');

  const sqlNamespace = useMemo(
    () => convertToSQLNamespace(databaseModelsArray),
    [databaseModelsArray],
  );
  const schema = useMemo(
    () => ({
      ...sqlNamespace,
    }),
    [sqlNamespace],
  );

  /**
   * Handlers
   */
  const handleRunQuery = async (mode?: RunScriptMode) => {
    const editorHandle = editorRef.current;
    if (!editorHandle) return;

    // Use the imperative handle method to get full query content
    const fullQuery = editorHandle.getValues ? editorHandle.getValues() : '';
    let queryToRun = fullQuery;

    if (mode === 'selection') {
      // Use the imperative handle method to get selected text
      const selectedText = editorHandle.getSelection ? editorHandle.getSelection() : '';

      if (selectedText && selectedText.trim().length > 0) {
        queryToRun = selectedText;
      }
    }

    setLastExecutedContent(fullQuery);
    setDirty(false);
    runScriptQuery(queryToRun);
  };

  const handleQuerySave = useCallback(async () => {
    const editorHandle = editorRef.current;
    const content = editorHandle?.getValues ? editorHandle.getValues() : '';
    updateSQLScriptContent(sqlScript, content);
  }, [sqlScript]);

  const handleEditorValueChange = useDebouncedCallback(async () => {
    handleQuerySave();
  }, 300);

  const onSqlEditorChange = (newValue: string) => {
    if (lastExecutedContent) {
      setDirty(newValue !== lastExecutedContent);
    }
    handleEditorValueChange();
  };

  const handleAddScript = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
  };

  useEffect(() => {
    return () => {
      const cleanupEditorRef = editorRef.current;
      if (cleanupEditorRef && cleanupEditorRef.getValues) {
        const currentScript = cleanupEditorRef.getValues();
        if (currentScript !== sqlScript?.content) {
          handleQuerySave();
        }
      }
    };
  }, [handleQuerySave, sqlScript?.content]);

  useDidUpdate(() => {
    if (active) {
      const editorHandle = editorRef.current;
      if (editorHandle && editorHandle.getEditor) {
        const editor = editorHandle.getEditor();
        if (editor && editor.focus) {
          editor.focus();
        }
      }
    }
  }, [active]);

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
      />

      <Group className="h-[calc(100%-40px)]">
        <SqlEditor
          onBlur={handleQuerySave}
          ref={editorRef}
          colorSchemeDark={colorScheme === 'dark'}
          value={sqlScript?.content || ''}
          onChange={onSqlEditorChange}
          schema={schema}
          duckDBFunctions={duckdbFunctionList}
          onRunSelection={() => handleRunQuery('selection')}
          onRunFullQuery={handleRunQuery}
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
