import { Group, Text, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useAppContext } from '@features/app-context';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore } from '@store/app-store';
import { SqlEditor } from '@features/editor';
import { convertToSQLNamespace, createDuckDBCompletions } from '@features/editor/auto-complete';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { Spotlight } from '@mantine/spotlight';
import { formatNumber } from '@utils/helpers';
import { splitSqlQuery } from '@utils/editor/statement-parser';
import { setDataTestId } from '@utils/test-id';
import { useChangeQueryContentMutation, useUpdateTabMutation } from '@store/app-idb-store';

import { useAppNotifications } from '@components/app-notifications';
import { SQLScriptId } from '@models/sql-script';
import { useSqlScript } from '@store/init-store';
import { RunQueryButton } from './components/run-query-button';
import duckdbFunctionList from '../editor/duckdb-function-tooltip.json';

interface QueryEditorProps {
  columnsCount: number;
  rowsCount: number;
  id: SQLScriptId;
  active?: boolean;
}

export const QueryEditor = ({ columnsCount, rowsCount, id, active }: QueryEditorProps) => {
  const sqlScript = useSqlScript(id);
  const { mutateAsync: updateTab } = useUpdateTabMutation();
  const { mutateAsync: updateQueryFile } = useChangeQueryContentMutation();
  /**
   * Common hooks
   */
  const { runQuery } = useAppContext();
  const { showError } = useAppNotifications();
  const { colorScheme } = useMantineColorScheme();

  const databases = useAppStore((state) => state.databases);

  // TODO: get query loading state from the store
  // const queryRunning = tab?.query.state === 'fetching';
  const queryRunning = false;

  /**
   * State
   */
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [fontSize, setFontSize] = useState(0.875);

  const sqlNamespace = useMemo(() => convertToSQLNamespace(databases), [databases]);
  const duckdbNamespace = useMemo(() => createDuckDBCompletions(duckdbFunctionList), []);
  const schema = useMemo(
    () => ({
      ...duckdbNamespace,
      ...sqlNamespace,
    }),
    [duckdbNamespace, sqlNamespace],
  );

  const [queryExecuted, setQueryExecuted] = useState(false);

  /**
   * Handlers
   */
  const handleRunQuery = async (mode?: 'all' | 'selection') => {
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

    // TODO: Run sql script
    // updateTab({
    //   id: tab.id,
    //   query: {
    //     ...tab.query,
    //     state: 'fetching',
    //   },
    // });
    // setQueryExecuted(false);

    // const result = await runQuery({ query: queryToRun });
    // setQueryExecuted(true);

    // await updateTab({
    //   id: tab.id,
    //   dataView: {
    //     data: result?.data,
    //     rowCount: result?.pagination || 0,
    //   },
    //   query: {
    //     ...tab.query,
    //     state: 'success',
    //     originalQuery: queryToRun,
    //   },
    // });
  };

  const handleQuerySave = async () => {
    // TODO: save sql script to the store
    // if (!tab || !queryFile) {
    //   showError({ title: 'Query file not found', message: '' });
    //   return;
    // }
    // await updateQueryFile({
    //   id: queryFile.id,
    //   content: editorRef.current?.view?.state?.doc.toString() || '',
    // });
  };

  const handleEditorValueChange = useDebouncedCallback(async () => {
    handleQuerySave();
  }, 300);

  const onSqlEditorChange = () => {
    setQueryExecuted(false);
    handleEditorValueChange();
  };

  // eslint-disable-next-line arrow-body-style
  useEffect(() => {
    return () => {
      if (editorRef.current?.view) {
        const editor = editorRef.current.view;
        const currentQuery = editor.state.doc.toString();
        if (currentQuery !== sqlScript?.content) {
          handleQuerySave();
        }
      }
    };
  }, []);

  return (
    <div className="h-full">
      <Group className="px-3 h-10" justify="space-between">
        <Group gap={2}>
          {queryRunning && (
            <Text c="text-secondary" className="text-sm font-medium">
              Processing Query...
            </Text>
          )}
          {queryExecuted && !queryRunning && (
            <>
              <Text c="text-success" className="text-sm font-medium">
                Query ran successfully.
              </Text>
              <Text c="text-secondary" className="text-sm font-medium">
                {columnsCount} columns, {formatNumber(rowsCount)} rows
              </Text>
            </>
          )}
        </Group>
        <RunQueryButton disabled={queryRunning} handleRunQuery={handleRunQuery} />
      </Group>
      <Group
        className="h-[calc(100%-40px)]"
        data-testid={setDataTestId('query-editor')}
        data-active-editor={!!active}
      >
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
