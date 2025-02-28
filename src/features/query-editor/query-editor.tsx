import { Group, Text, useMantineColorScheme } from '@mantine/core';
import { useDebouncedCallback, useLocalStorage } from '@mantine/hooks';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useAppContext } from 'features/app-context';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore } from 'store/app-store';
import { useEditorStore } from 'store/editor-store';
import { usePaginationStore } from 'store/pagination-store';
import { SqlEditor } from '@features/editor';
import { convertToSQLNamespace, createDuckDBCompletions } from '@features/editor/auto-complete';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { Spotlight } from '@mantine/spotlight';
import { formatNumber } from '@utils/helpers';
import { splitSqlQuery } from '@utils/editor/statement-parser';
import { RunQueryButton } from './components/run-query-button';
import duckdbFunctionList from '../editor/duckdb-function-tooltip.json';

interface QueryEditorProps {
  columnsCount: number;
  rowsCount: number;
  hasTableData: boolean;
}

export const QueryEditor = ({ columnsCount, rowsCount, hasTableData }: QueryEditorProps) => {
  /**
   * Common hooks
   */
  const context = useAppContext();

  const { colorScheme } = useMantineColorScheme();
  const [autoSaveValue] = useLocalStorage({ key: 'editor-auto-save' });

  const currentQuery = useAppStore((state) => state.currentQuery);
  const queries = useAppStore((state) => state.queries);
  const setOriginalQuery = useAppStore((state) => state.setOriginalQuery);
  const setQueryRunning = useAppStore((state) => state.setQueryRunning);
  const queryRunning = useAppStore((state) => state.queryRunning);
  const databases = useAppStore((state) => state.databases);

  const lastQueryDirty = useEditorStore((state) => state.lastQueryDirty);
  const setLastQueryDirty = useEditorStore((state) => state.setLastQueryDirty);
  const setEditorValue = useEditorStore((state) => state.setEditorValue);
  const setSaving = useEditorStore((state) => state.setSaving);

  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);

  const currentQueryData = queries.find((query) => query.path === currentQuery);

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

    setCurrentPage(1);
    setOriginalQuery('');
    setQueryRunning(true);
    await context.runQuery({ query: queryToRun });
    setQueryRunning(false);
  };

  const handleQuerySave = async () => {
    if (!currentQuery) return;
    setSaving(true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    await context.onSaveEditor({
      content: editorRef.current?.view?.state?.doc.toString() || '',
      path: currentQuery,
    });
    setLastQueryDirty(false);
    setSaving(false);
  };

  const handleSearch = useDebouncedCallback(async () => {
    if (autoSaveValue && lastQueryDirty) {
      handleQuerySave();
    }
  }, 1000);

  const handleChange = (value: string | undefined) => {
    setEditorValue(value || '');
    if (value !== currentQueryData?.content) {
      if (autoSaveValue) {
        handleSearch();
      }
      setLastQueryDirty(true);
    } else {
      setLastQueryDirty(false);
    }
  };

  /**
   * Effects
   */
  useEffect(() => {
    const view = editorRef.current?.view;

    if (!view) return;

    const transaction = view.state.update({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: currentQueryData?.content || '',
      },
    });
    if (transaction) {
      view.dispatch(transaction);
    }
    setLastQueryDirty(false);
  }, [currentQuery]);

  return (
    <div className="h-full">
      <Group className="px-3 h-10" justify="space-between">
        <Group gap={2}>
          {queryRunning && (
            <Text c="text-secondary" className="text-sm font-medium">
              Processing Query...
            </Text>
          )}
          {hasTableData && !queryRunning && (
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
      <Group className="h-[calc(100%-40px)]">
        <SqlEditor
          ref={editorRef}
          colorSchemeDark={colorScheme === 'dark'}
          value={currentQueryData?.content || ''}
          onChange={handleChange}
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
