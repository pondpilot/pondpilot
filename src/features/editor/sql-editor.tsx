/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Modified by Andrii Butko (C) [2025]
 * Licensed under GNU AGPL v3.0
 */
import {
  acceptCompletion,
  completionStatus,
  startCompletion,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, insertTab, history } from '@codemirror/commands';
import { sql, SQLNamespace, PostgreSQL } from '@codemirror/lang-sql';
import { Prec } from '@codemirror/state';
import { keymap, placeholder, ViewPlugin } from '@codemirror/view';
import { formatSQLInEditor } from '@controllers/sql-formatter';
import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { useAppStore } from '@store/app-store';
import CodeMirror, { EditorView, Extension, ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { SqlStatementHighlightPlugin } from '@utils/editor/highlight-plugin';
import { KEY_BINDING } from '@utils/hotkey/key-matcher';
import { forwardRef, KeyboardEventHandler, useMemo, useRef } from 'react';

import { aiAssistantStateField } from './ai-assistant/state-field';
import { aiAssistantTooltip, structuredResponseField } from './ai-assistant-tooltip';
import { functionTooltip } from './function-tooltips';
import { useEditorTheme } from './hooks';
import createSQLTableNameHighlightPlugin from './sql-tablename-highlight';
import { useDatabaseConnectionPool } from '../database-context';

type FunctionTooltip = Record<string, { syntax: string; description: string }>;

// Custom theme for placeholder styling
const placeholderTheme = EditorView.theme({
  '.cm-placeholder': {
    color: '#9CA3AF',
    fontStyle: 'italic',
    whiteSpace: 'nowrap',
  },
});

interface SqlEditorProps {
  colorSchemeDark: boolean;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  schema?: SQLNamespace;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onCursorChange?: (pos: number, lineNumber: number, columnNumber: number) => void;
  onBlur: () => void;
  functionTooltips: FunctionTooltip;
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
      onBlur,
      functionTooltips,
    }: SqlEditorProps,
    ref,
  ) => {
    const { darkTheme, lightTheme } = useEditorTheme(colorSchemeDark);
    const connectionPool = useDatabaseConnectionPool();
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const sqlScripts = useAppStore((state) => state.sqlScripts);
    const { preferences, updatePreference } = useEditorPreferences();

    const tableNameHighlightPlugin = useMemo(() => {
      if (schema) {
        return createSQLTableNameHighlightPlugin(Object.keys(schema));
      }
      return createSQLTableNameHighlightPlugin([]);
    }, [schema]);

    const keyExtensions = useMemo(
      () =>
        Prec.highest(
          keymap.of([
            {
              key: 'Tab',
              run: (target) => {
                if (completionStatus(target.state) === 'active') {
                  // Accept the autocompletion suggestion when Tab is pressed
                  acceptCompletion(target);
                  return true;
                }
                return insertTab(target);
              },
            },
            {
              key: KEY_BINDING.run.toCodeMirrorKey(),
              preventDefault: true,
              run: () => true,
            },
            {
              key: 'Ctrl-Space',
              mac: 'Cmd-Space',
              preventDefault: true,
              run: startCompletion,
            },
            {
              key: 'Ctrl-=',
              mac: 'Cmd-=',
              preventDefault: true,
              run: () => {
                const newFontSize = Math.min(2, preferences.fontSize + 0.1);
                updatePreference('fontSize', newFontSize);
                return true;
              },
            },
            {
              key: 'Ctrl--',
              mac: 'Cmd--',
              preventDefault: true,
              run: () => {
                const newFontSize = Math.max(0.4, preferences.fontSize - 0.1);
                updatePreference('fontSize', newFontSize);
                return true;
              },
            },
            {
              key: KEY_BINDING.format.toCodeMirrorKey(),
              preventDefault: true,
              run: (view) => {
                formatSQLInEditor(view);
                return true;
              },
            },

            // Add completion keymap but filter out Tab since we handle it above
            ...completionKeymap.filter((binding) => {
              const key = binding.key || '';
              return !key.includes('Tab');
            }),
            // Filter out Cmd-i from defaultKeymap to avoid conflicts with AI assistant
            ...defaultKeymap.filter((binding) => {
              // Remove any binding that uses Cmd-i or Ctrl-i
              const key = binding.key || '';
              const mac = binding.mac || '';
              return !key.includes('Mod-i') && !key.includes('Ctrl-i') && !mac.includes('Cmd-i');
            }),
          ]),
        ),
      [preferences.fontSize, updatePreference],
    );

    const extensions = useMemo(() => {
      const sqlDialect = sql({
        dialect: PostgreSQL,
        upperCaseKeywords: true,
        schema,
      });
      const aiAssistantExtension = aiAssistantTooltip(connectionPool, undefined, sqlScripts);
      const tooltipExtension = functionTooltip(functionTooltips);

      return [
        history(),
        keyExtensions, // Our keymaps need to come first to have priority
        sqlDialect,
        tooltipExtension,
        aiAssistantExtension,
        tableNameHighlightPlugin,
        SqlStatementHighlightPlugin,
        // Dynamic placeholder extension
        (() => {
          const updatePlaceholder = (view: EditorView) => {
            const aiState = view.state.field(aiAssistantStateField, false);
            const structuredResponseState = view.state.field(structuredResponseField, false);
            const placeholderElement = view.dom.querySelector('.cm-placeholder') as HTMLElement;

            if (placeholderElement) {
              // Hide placeholder if either AI assistant or structured response is visible
              if (aiState?.visible || structuredResponseState?.response) {
                placeholderElement.style.display = 'none';
                placeholderElement.style.visibility = 'hidden';
              } else {
                placeholderElement.style.display = '';
                placeholderElement.style.visibility = '';
              }
            } else if (aiState?.visible || structuredResponseState?.response) {
              // If placeholder doesn't exist yet but AI is visible, try again
              setTimeout(() => updatePlaceholder(view), 0);
            }
          };

          return ViewPlugin.fromClass(
            class PlaceholderVisibilityPlugin {
              constructor(view: EditorView) {
                updatePlaceholder(view);
                // Check again after a short delay to catch any late-rendered placeholders
                setTimeout(() => updatePlaceholder(view), 10);
                setTimeout(() => updatePlaceholder(view), 100);
              }

              update(update: any) {
                if (
                  update.docChanged ||
                  update.startState.field(aiAssistantStateField, false)?.visible !==
                    update.state.field(aiAssistantStateField, false)?.visible ||
                  update.startState.field(structuredResponseField, false)?.response !==
                    update.state.field(structuredResponseField, false)?.response
                ) {
                  updatePlaceholder(update.view);
                }
              }
            },
          );
        })(),
        placeholder('Press Cmd+I to open the AI Assistant'),
        placeholderTheme,
        EditorView.updateListener.of((state: any) => {
          const pos = state.state.selection.main.head;
          const line = state.state.doc.lineAt(pos);
          const lineNumber = line.number;
          const columnNumber = pos - line.from;
          if (onCursorChange) onCursorChange(pos, lineNumber, columnNumber);
        }),
      ].filter(Boolean) as Extension[];
    }, [
      onCursorChange,
      keyExtensions,
      schema,
      tableNameHighlightPlugin,
      functionTooltips,
      connectionPool,
      sqlScripts,
    ]);

    return (
      <CodeMirror
        ref={(instance) => {
          if (ref) {
            if (typeof ref === 'function') {
              ref(instance);
            } else {
              ref.current = instance;
            }
          }
          if (instance) {
            (editorRef as any).current = instance;
          }
        }}
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
          fontSize: `${preferences.fontSize}rem`,
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight:
            preferences.fontWeight === 'light'
              ? 300
              : preferences.fontWeight === 'regular'
                ? 400
                : preferences.fontWeight === 'semibold'
                  ? 600
                  : 700,
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
