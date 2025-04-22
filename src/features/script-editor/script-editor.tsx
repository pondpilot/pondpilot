import { Group, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useEffect, useRef, useState, useMemo } from 'react';
import { SqlEditor } from '@features/editor';
import { convertToSQLNamespace, createDuckDBCompletions } from '@features/editor/auto-complete';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { Spotlight } from '@mantine/spotlight';
import { splitSqlQuery } from '@utils/editor/statement-parser';
import { setDataTestId } from '@utils/test-id';

import { RunScriptMode, ScriptExecutionState, SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import { updateSQLScriptContent } from '@controllers/sql-script';
import duckdbFunctionList from '../editor/duckdb-function-tooltip.json';
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

  /**
   * State
   */
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [fontSize, setFontSize] = useState(0.875);
  const [dirty, setDirty] = useState(false);
  const [lastExecutedContent, setLastExecutedContent] = useState('');

  const sqlNamespace = useMemo(
    () => convertToSQLNamespace(databaseModelsArray),
    [databaseModelsArray],
  );
  const duckdbNamespace = useMemo(() => createDuckDBCompletions(duckdbFunctionList), []);
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
          fontSize={fontSize}
          onFontSizeChanged={setFontSize}
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
              e.preventDefault();
              e.stopPropagation();
            } else if (KEY_BINDING.kmenu.match(e)) {
              Spotlight.open();
            }
          }}
        />
      </Group>
    </div>
  );
};
