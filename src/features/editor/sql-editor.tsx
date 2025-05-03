/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Modified by Andrii Butko (C) [2025]
 * Licensed under GNU AGPL v3.0
 */
import { acceptCompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, insertTab, history } from '@codemirror/commands';
import { sql, SQLNamespace, PostgreSQL } from '@codemirror/lang-sql';
import { keymap } from '@codemirror/view';
import { showNotification } from '@mantine/notifications';
import CodeMirror, { EditorView, Extension, ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { SqlStatementHighlightPlugin } from '@utils/editor/highlight-plugin';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { forwardRef, KeyboardEventHandler, useMemo } from 'react';

import duckdbFunctionList from './duckdb-function-tooltip.json';
import { functionTooltip } from './function-tooltips';
import { useEditorTheme } from './hooks';
import createSQLTableNameHighlightPlugin from './sql-tablename-highlight';

interface SqlEditorProps {
  colorSchemeDark: boolean;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  schema?: SQLNamespace;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  fontSize?: number;
  onFontSizeChanged?: (fontSize: number) => void;
  onCursorChange?: (pos: number, lineNumber: number, columnNumber: number) => void;
  onBlur: () => void;
}

export const SqlEditor = forwardRef<ReactCodeMirrorRef, SqlEditorProps>(
  (
    {
      colorSchemeDark,
      value,
      onChange,
      schema,
      onKeyDown,
      onCursorChange,
      readOnly,
      fontSize,
      onFontSizeChanged,
      onBlur,
    }: SqlEditorProps,
    ref,
  ) => {
    const { darkTheme, lightTheme } = useEditorTheme(colorSchemeDark);
    const tableNameHighlightPlugin = useMemo(() => {
      if (schema) {
        return createSQLTableNameHighlightPlugin(Object.keys(schema));
      }
      return createSQLTableNameHighlightPlugin([]);
    }, [schema]);

    const keyExtensions = useMemo(
      () =>
        keymap.of([
          {
            key: KEY_BINDING.run.toCodeMirrorKey(),
            preventDefault: true,
            run: () => true,
          },
          {
            key: 'Tab',
            preventDefault: true,
            run: (target) => {
              if (completionStatus(target.state) === 'active') {
                acceptCompletion(target);
              } else {
                insertTab(target);
              }
              return true;
            },
          },
          {
            key: 'Ctrl-Space',
            mac: 'Cmd-i',
            preventDefault: true,
            run: startCompletion,
          },
          {
            key: 'Ctrl-=',
            mac: 'Cmd-=',
            preventDefault: true,
            run: () => {
              if (onFontSizeChanged) {
                const newFontSize = Math.min(2, (fontSize ?? 1) + 0.2);
                onFontSizeChanged(newFontSize);
                showNotification({
                  message: `Change code editor font size to ${Math.floor(newFontSize * 100)}%`,
                  autoClose: 1000,
                  id: 'font-size',
                });
              }
              return true;
            },
          },
          {
            key: 'Ctrl--',
            mac: 'Cmd--',
            preventDefault: true,
            run: () => {
              if (onFontSizeChanged) {
                const newFontSize = Math.max(0.4, (fontSize ?? 1) - 0.2);
                onFontSizeChanged(newFontSize);
                showNotification({
                  message: `Change code editor font size to ${Math.floor(newFontSize * 100)}%`,
                  autoClose: 1000,
                  id: 'font-size',
                });
              }
              return true;
            },
          },

          ...defaultKeymap,
        ]),
      [fontSize, onFontSizeChanged],
    );

    const extensions = useMemo(() => {
      const sqlDialect = sql({
        dialect: PostgreSQL,
        upperCaseKeywords: true,
        schema,
      });
      const tooltipExtension = functionTooltip(duckdbFunctionList);

      return [
        history(),
        keyExtensions,
        sqlDialect,
        tooltipExtension,
        tableNameHighlightPlugin,
        SqlStatementHighlightPlugin,
        EditorView.updateListener.of((state: any) => {
          const pos = state.state.selection.main.head;
          const line = state.state.doc.lineAt(pos);
          const lineNumber = line.number;
          const columnNumber = pos - line.from;
          if (onCursorChange) onCursorChange(pos, lineNumber, columnNumber);
        }),
      ].filter(Boolean) as Extension[];
    }, [onCursorChange, keyExtensions, schema, tableNameHighlightPlugin]);

    return (
      <CodeMirror
        ref={ref}
        autoFocus
        readOnly={readOnly}
        onKeyDown={onKeyDown}
        basicSetup={{
          defaultKeymap: false,
          drawSelection: false,
        }}
        theme={colorSchemeDark ? darkTheme : lightTheme}
        onBlur={onBlur}
        value={value}
        height="100%"
        width="100%"
        onChange={onChange}
        style={{
          fontSize: fontSize ? `${fontSize}rem` : '0.875rem',
          height: '100%',
          width: '100%',
          flex: 1,
        }}
        className="w-full h-full"
        extensions={extensions}
      />
    );
  },
);
