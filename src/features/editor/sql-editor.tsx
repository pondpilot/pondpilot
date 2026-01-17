/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Modified by Andrii Butko (C) [2025]
 * Licensed under GNU AGPL v3.0
 */

import { formatSQLInEditor } from '@controllers/sql-formatter';
import { useEditorPreferences } from '@hooks/use-editor-preferences';
import MonacoEditor from '@monaco-editor/react';
import type { CompletionContext, Span } from '@pondpilot/flowscope-core';
import { useAppStore } from '@store/app-store';
import { checkValidDuckDBIdentifer } from '@utils/duckdb/identifier';
import { fromUtf8Offset, toUtf8Offset } from '@utils/editor/sql';
import * as monaco from 'monaco-editor';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { registerAIAssistant, showAIAssistant, hideAIAssistant } from './ai-assistant-tooltip';
import { useEditorTheme } from './hooks';
import { getFlowScopeClient } from '../../workers/flowscope-client';
import { useDuckDBConnectionPool } from '../duckdb-context/duckdb-context';

type FunctionTooltip = Record<string, { syntax: string; description: string; example?: string }>;

export interface SqlEditorHandle {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  monaco: typeof monaco | null;
  runFullAnalysis: () => void;
  getStatementRangeAtOffset: (offset: number) => { start: number; end: number } | null;
}

interface SqlEditorProps {
  colorSchemeDark: boolean;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  schema?: import('@pondpilot/flowscope-core').SchemaMetadata;
  onKeyDown?: (event: monaco.IKeyboardEvent) => void;
  onCursorChange?: (pos: number, lineNumber: number, columnNumber: number) => void;
  onRun?: () => void;
  onRunSelection?: () => void;
  onBlur: () => void;
  functionTooltips: FunctionTooltip;
  path?: string;
}

type AnalysisCache = {
  sql: string;
  result: import('@pondpilot/flowscope-core').AnalyzeResult | null;
  promise: Promise<import('@pondpilot/flowscope-core').AnalyzeResult> | null;
};

const AI_WIDGET_PLACEHOLDER = 'Press Cmd+I to open the AI Assistant';

type FontWeight = 'light' | 'regular' | 'semibold' | 'bold';

function getFontWeightValue(weight: FontWeight): string {
  switch (weight) {
    case 'light':
      return '300';
    case 'regular':
      return '400';
    case 'semibold':
      return '600';
    case 'bold':
      return '700';
  }
}

// Monaco snippet syntax uses ${n:placeholder} format
/* eslint-disable no-template-curly-in-string */
const keywordSnippetMap: Record<string, string> = {
  'CASE WHEN ... THEN ... END': 'CASE WHEN ${1:condition} THEN ${2:value} END',
  'COALESCE(expr, ...)': 'COALESCE(${1:expr}, ${2:expr})',
  'CAST(expr AS type)': 'CAST(${1:expr} AS ${2:type})',
  'COUNT(*)': 'COUNT(*)',
  'FILTER (WHERE ...)': 'FILTER (WHERE ${1:condition})',
  'OVER (PARTITION BY ...)': 'OVER (PARTITION BY ${1:columns})',
};
/* eslint-enable no-template-curly-in-string */

const createCompletionRange = (
  model: monaco.editor.ITextModel,
  contextToken: CompletionContext['token'],
  position: monaco.Position,
  tokenBaseOffset: number = 0,
): monaco.IRange => {
  if (!contextToken) {
    return new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column,
    );
  }

  const startOffset = fromUtf8Offset(model.getValue(), contextToken.span.start + tokenBaseOffset);
  const endOffset = fromUtf8Offset(model.getValue(), contextToken.span.end + tokenBaseOffset);
  const startPos = model.getPositionAt(startOffset);
  const endPos = model.getPositionAt(endOffset);

  return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
};

const applyIdentifier = (name: string): string => {
  if (checkValidDuckDBIdentifer(name)) {
    return name;
  }
  return `"${name}"`;
};

const buildCompletionItems = (
  context: CompletionContext,
  functionTooltips: FunctionTooltip,
  range: monaco.IRange,
  schemaTables: Array<{ name: string; displayName: string }>,
): monaco.languages.CompletionItem[] => {
  const items: monaco.languages.CompletionItem[] = [];

  context.keywordHints.clause.keywords.forEach((keyword: string) => {
    items.push({
      label: keyword,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: keyword,
      range,
    });
  });

  context.keywordHints.clause.operators.forEach((operator: string) => {
    items.push({
      label: operator,
      kind: monaco.languages.CompletionItemKind.Operator,
      insertText: operator,
      range,
    });
  });

  context.keywordHints.clause.aggregates.forEach((aggregate: string) => {
    items.push({
      label: aggregate,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${aggregate}(`,
      range,
    });
  });

  context.keywordHints.clause.snippets.forEach((snippet: string) => {
    const insertText = keywordSnippetMap[snippet] || snippet;
    items.push({
      label: snippet,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    });
  });

  context.columnsInScope.forEach((column: CompletionContext['columnsInScope'][number]) => {
    const label =
      column.isAmbiguous && column.table ? `${column.table}.${column.name}` : column.name;
    items.push({
      label,
      kind: monaco.languages.CompletionItemKind.Field,
      insertText: label,
      range,
      detail: column.dataType ? `${column.dataType}` : undefined,
    });
  });

  context.tablesInScope.forEach((table: CompletionContext['tablesInScope'][number]) => {
    const label = table.alias ? `${table.alias} (${table.name})` : table.name;
    const insertText = applyIdentifier(table.alias || table.name);
    items.push({
      label,
      kind: monaco.languages.CompletionItemKind.Struct,
      insertText,
      range,
      detail: table.canonical || undefined,
    });
  });

  schemaTables.forEach((table) => {
    items.push({
      label: table.displayName,
      kind: monaco.languages.CompletionItemKind.Struct,
      insertText: applyIdentifier(table.name),
      range,
    });
  });

  Object.entries(functionTooltips).forEach(([name, tooltip]) => {
    items.push({
      label: name,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${name}(`,
      range,
      detail: tooltip.syntax,
      documentation: tooltip.description || undefined,
    });
  });

  return items;
};

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  (
    {
      colorSchemeDark,
      value,
      onChange,
      schema,
      onKeyDown,
      onCursorChange,
      onRun,
      onRunSelection,
      readOnly,
      onBlur,
      functionTooltips,
      path,
    }: SqlEditorProps,
    ref,
  ) => {
    const { themeName, themeData } = useEditorTheme(colorSchemeDark);
    const connectionPool = useDuckDBConnectionPool();
    const sqlScripts = useAppStore((state) => state.sqlScripts);
    const { preferences, updatePreference } = useEditorPreferences();

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof monaco | null>(null);
    const disposablesRef = useRef<monaco.IDisposable[]>([]);
    const analysisCacheRef = useRef<AnalysisCache>({ sql: '', result: null, promise: null });
    const statementDecorationsRef = useRef<string[]>([]);
    const tableDecorationsRef = useRef<string[]>([]);
    const fullAnalysisTimerRef = useRef<number | null>(null);
    const fullAnalysisRunRef = useRef(0);
    const statementSplitTimerRef = useRef<number | null>(null);
    const statementSpansRef = useRef<{
      sql: string;
      spans: Span[];
      promise: Promise<Span[]> | null;
    }>({ sql: '', spans: [], promise: null });
    const statementAnalysisCacheRef = useRef(new Map<string, AnalysisCache['result']>());
    const cursorOffsetRef = useRef(0);
    const mountedRef = useRef(true);
    const [assistantVisible, setAssistantVisible] = useState(false);
    const [structuredResponseVisible, setStructuredResponseVisible] = useState(false);

    const getSchemaTables = useMemo(() => {
      if (!schema?.tables) return [];
      return schema.tables.map((table) => ({
        name: table.name,
        displayName: table.schema ? `${table.schema}.${table.name}` : table.name,
      }));
    }, [schema]);

    const schemaCacheKey = useMemo(() => (schema ? JSON.stringify(schema) : ''), [schema]);

    useEffect(() => {
      analysisCacheRef.current = { sql: '', result: null, promise: null };
      statementAnalysisCacheRef.current.clear();
    }, [schemaCacheKey]);

    const getFlowScopeAnalysis = useCallback(
      async (sqlText: string) => {
        const cache = analysisCacheRef.current;
        if (!sqlText.trim()) {
          cache.sql = sqlText;
          cache.result = null;
          cache.promise = null;
          return null;
        }
        if (cache.sql === sqlText && cache.result) {
          return cache.result;
        }
        if (cache.sql === sqlText && cache.promise) {
          return cache.promise;
        }

        const client = getFlowScopeClient();
        cache.sql = sqlText;
        cache.promise = client
          .analyze(sqlText, schema)
          .then((result) => {
            cache.result = result;
            cache.promise = null;
            return result;
          })
          .catch((error) => {
            cache.result = null;
            cache.promise = null;
            throw error;
          });

        return cache.promise;
      },
      [schema],
    );

    const getStatementSpans = useCallback(async (sqlText: string): Promise<Span[]> => {
      const cache = statementSpansRef.current;
      if (!sqlText.trim()) {
        cache.sql = sqlText;
        cache.spans = [];
        cache.promise = null;
        return [];
      }
      if (cache.sql === sqlText && cache.spans.length > 0) {
        return cache.spans;
      }
      if (cache.sql === sqlText && cache.promise) {
        return cache.promise;
      }

      const client = getFlowScopeClient();
      cache.sql = sqlText;
      cache.promise = client
        .split(sqlText)
        .then((result) => {
          cache.spans = result.statements;
          cache.promise = null;
          return result.statements;
        })
        .catch((error: Error) => {
          cache.spans = [];
          cache.promise = null;
          throw error;
        });

      return cache.promise ?? [];
    }, []);

    const findStatementSpan = useCallback((spans: Span[], cursorOffset: number) => {
      if (spans.length === 0) return null;
      for (let index = 0; index < spans.length; index += 1) {
        const span = spans[index];
        if (cursorOffset < span.start) {
          return index === 0 ? span : spans[index - 1];
        }
        if (cursorOffset >= span.start && cursorOffset <= span.end) {
          return span;
        }
      }
      return spans[spans.length - 1];
    }, []);

    const getStatementContext = useCallback(
      async (sqlText: string, cursorOffset: number) => {
        const spans = await getStatementSpans(sqlText);
        const span = findStatementSpan(spans, cursorOffset);
        if (!span) {
          return {
            sql: sqlText,
            cursorOffset,
            span: null,
          };
        }

        const startIndex = fromUtf8Offset(sqlText, span.start);
        const endIndex = fromUtf8Offset(sqlText, span.end);
        return {
          sql: sqlText.slice(startIndex, endIndex),
          cursorOffset: Math.max(0, cursorOffset - span.start),
          span,
        };
      },
      [findStatementSpan, getStatementSpans],
    );

    const getStatementAnalysis = useCallback(
      async (sqlText: string, cursorOffset: number) => {
        const context = await getStatementContext(sqlText, cursorOffset);
        if (!context.sql.trim()) {
          return null;
        }

        const cacheKey = `${schemaCacheKey}:${context.sql}`;
        const cache = statementAnalysisCacheRef.current;
        if (cache.has(cacheKey)) {
          return {
            analysis: cache.get(cacheKey) ?? null,
            span: context.span,
          };
        }

        const client = getFlowScopeClient();
        const analysis = await client.analyze(context.sql, schema);
        cache.set(cacheKey, analysis);
        if (cache.size > 100) {
          cache.clear();
          cache.set(cacheKey, analysis);
        }

        return {
          analysis,
          span: context.span,
        };
      },
      [getStatementContext, schema, schemaCacheKey],
    );

    const updateStatementHighlight = useCallback(
      (model: monaco.editor.ITextModel, cursorOffset: number) => {
        if (!editorRef.current || !monacoRef.current) return;

        const sqlText = model.getValue();
        if (!sqlText.trim()) {
          statementDecorationsRef.current = editorRef.current.deltaDecorations(
            statementDecorationsRef.current,
            [],
          );
          return;
        }

        const spansCache = statementSpansRef.current;
        if (spansCache.sql !== sqlText || spansCache.spans.length === 0) {
          statementDecorationsRef.current = editorRef.current.deltaDecorations(
            statementDecorationsRef.current,
            [],
          );
          return;
        }

        const statementSpan = findStatementSpan(spansCache.spans, cursorOffset);
        if (!statementSpan) {
          statementDecorationsRef.current = editorRef.current.deltaDecorations(
            statementDecorationsRef.current,
            [],
          );
          return;
        }

        const startOffset = fromUtf8Offset(sqlText, statementSpan.start);
        const endOffset = fromUtf8Offset(sqlText, statementSpan.end);
        const startPos = model.getPositionAt(startOffset);
        const endPos = model.getPositionAt(endOffset);

        // Use a single multi-line decoration instead of one per line for better performance
        statementDecorationsRef.current = editorRef.current.deltaDecorations(
          statementDecorationsRef.current,
          [
            {
              range: new monaco.Range(
                startPos.lineNumber,
                1,
                endPos.lineNumber,
                model.getLineMaxColumn(endPos.lineNumber),
              ),
              options: {
                isWholeLine: true,
                className: 'monaco-statement-highlight',
              },
            },
          ],
        );
      },
      [findStatementSpan],
    );

    const applyTableHighlights = useCallback(
      (model: monaco.editor.ITextModel, analysis: AnalysisCache['result']) => {
        if (!editorRef.current) return;
        if (!analysis) {
          tableDecorationsRef.current = editorRef.current.deltaDecorations(
            tableDecorationsRef.current,
            [],
          );
          return;
        }

        const decorations: monaco.editor.IModelDeltaDecoration[] = [];

        analysis.statements.forEach((statement) => {
          statement.nodes.forEach((node) => {
            if (
              !node.span ||
              (node.type !== 'table' && node.type !== 'view' && node.type !== 'cte')
            ) {
              return;
            }
            const startOffset = fromUtf8Offset(model.getValue(), node.span.start);
            const endOffset = fromUtf8Offset(model.getValue(), node.span.end);
            const startPos = model.getPositionAt(startOffset);
            const endPos = model.getPositionAt(endOffset);

            decorations.push({
              range: new monaco.Range(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column,
              ),
              options: {
                inlineClassName: 'monaco-table-name',
              },
            });
          });
        });

        tableDecorationsRef.current = editorRef.current.deltaDecorations(
          tableDecorationsRef.current,
          decorations,
        );
      },
      [],
    );

    const applyDiagnostics = useCallback(
      (model: monaco.editor.ITextModel, analysis: AnalysisCache['result']) => {
        if (!monacoRef.current) return;
        if (!analysis) {
          monacoRef.current.editor.setModelMarkers(model, 'flowscope', []);
          return;
        }

        const markers: monaco.editor.IMarkerData[] = analysis.issues.map((issue) => {
          if (!issue.span) {
            return {
              severity: monaco.MarkerSeverity.Info,
              message: issue.message,
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            };
          }

          const startOffset = fromUtf8Offset(model.getValue(), issue.span.start);
          const endOffset = fromUtf8Offset(model.getValue(), issue.span.end);
          const startPos = model.getPositionAt(startOffset);
          const endPos = model.getPositionAt(endOffset);

          return {
            severity:
              issue.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : issue.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            message: issue.message,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          };
        });

        monacoRef.current.editor.setModelMarkers(model, 'flowscope', markers);
      },
      [],
    );

    const scheduleFullAnalysis = useCallback(
      (model: monaco.editor.ITextModel) => {
        if (fullAnalysisTimerRef.current) {
          window.clearTimeout(fullAnalysisTimerRef.current);
        }

        const runToken = fullAnalysisRunRef.current + 1;
        fullAnalysisRunRef.current = runToken;
        const version = model.getVersionId();

        fullAnalysisTimerRef.current = window.setTimeout(async () => {
          if (!mountedRef.current) return;
          if (model.isDisposed()) return;
          if (fullAnalysisRunRef.current !== runToken) return;
          if (model.getVersionId() !== version) return;

          try {
            const analysis = await getFlowScopeAnalysis(model.getValue());
            if (!mountedRef.current) return;
            applyDiagnostics(model, analysis);
            applyTableHighlights(model, analysis);
          } catch (error) {
            if (!mountedRef.current) return;
            applyDiagnostics(model, null);
            applyTableHighlights(model, null);
          }
        }, 400);
      },
      [applyDiagnostics, applyTableHighlights, getFlowScopeAnalysis],
    );

    const scheduleStatementSplit = useCallback(
      (model: monaco.editor.ITextModel) => {
        if (statementSplitTimerRef.current) {
          window.clearTimeout(statementSplitTimerRef.current);
        }

        statementAnalysisCacheRef.current.clear();
        statementSplitTimerRef.current = window.setTimeout(async () => {
          if (!mountedRef.current) return;
          if (model.isDisposed()) return;
          try {
            const sqlText = model.getValue();
            await getStatementSpans(sqlText);
            if (!mountedRef.current) return;
            updateStatementHighlight(model, cursorOffsetRef.current);
          } catch (error) {
            if (!mountedRef.current) return;
            statementSpansRef.current = { sql: model.getValue(), spans: [], promise: null };
            updateStatementHighlight(model, cursorOffsetRef.current);
          }
        }, 300);
      },
      [getStatementSpans, updateStatementHighlight],
    );

    const runFullAnalysis = useCallback(() => {
      const model = editorRef.current?.getModel();
      if (model) {
        scheduleFullAnalysis(model);
      }
    }, [scheduleFullAnalysis]);

    const getStatementRangeAtOffset = useCallback(
      (offset: number) => {
        const model = editorRef.current?.getModel();
        if (!model) return null;

        const sqlText = model.getValue();
        const spansCache = statementSpansRef.current;
        if (spansCache.sql !== sqlText || spansCache.spans.length === 0) {
          return null;
        }

        const cursorOffset = toUtf8Offset(sqlText, offset);
        const span = findStatementSpan(spansCache.spans, cursorOffset);
        if (!span) return null;

        return {
          start: fromUtf8Offset(sqlText, span.start),
          end: fromUtf8Offset(sqlText, span.end),
        };
      },
      [findStatementSpan],
    );

    useImperativeHandle(ref, () => ({
      editor: editorRef.current,
      monaco: monacoRef.current,
      runFullAnalysis,
      getStatementRangeAtOffset,
    }));

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        if (fullAnalysisTimerRef.current) {
          window.clearTimeout(fullAnalysisTimerRef.current);
        }
        if (statementSplitTimerRef.current) {
          window.clearTimeout(statementSplitTimerRef.current);
        }
        disposablesRef.current.forEach((disposable) => disposable.dispose());
        disposablesRef.current = [];
      };
    }, []);

    const handleEditorMount = (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco,
    ) => {
      editorRef.current = editor;
      monacoRef.current = monacoInstance;

      monacoInstance.editor.defineTheme(themeName, themeData as monaco.editor.IStandaloneThemeData);
      monacoInstance.editor.setTheme(themeName);

      const editorModel = editor.getModel();
      if (editorModel) {
        scheduleStatementSplit(editorModel);
        scheduleFullAnalysis(editorModel);
      }

      editor.updateOptions({
        fontSize: preferences.fontSize * 16,
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: getFontWeightValue(preferences.fontWeight as FontWeight),
        readOnly,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        contextmenu: true,
        wordWrap: 'on',
      });

      const aiManager = registerAIAssistant(editor, {
        connectionPool,
        sqlScripts,
        onVisibilityChange: (visible, structured) => {
          setAssistantVisible(visible);
          setStructuredResponseVisible(structured);
        },
      });

      disposablesRef.current.push(aiManager);

      disposablesRef.current.push(
        editor.onDidChangeCursorPosition((event: monaco.editor.ICursorPositionChangedEvent) => {
          const offset = editorModel ? editorModel.getOffsetAt(event.position) : 0;
          onCursorChange?.(offset, event.position.lineNumber, event.position.column);
          if (editorModel) {
            const cursorOffset = toUtf8Offset(editorModel.getValue(), offset);
            cursorOffsetRef.current = cursorOffset;
            updateStatementHighlight(editorModel, cursorOffset);
          }
        }),
      );

      disposablesRef.current.push(
        editor.onDidBlurEditorText(() => {
          onBlur();
        }),
      );

      disposablesRef.current.push(
        editor.onDidChangeModelContent(() => {
          if (editorModel) {
            scheduleStatementSplit(editorModel);
          }
        }),
      );

      if (onKeyDown) {
        disposablesRef.current.push(
          editor.onKeyDown((event: monaco.IKeyboardEvent) => onKeyDown(event)),
        );
      }

      editor.addCommand(monacoInstance.KeyCode.Tab, () => {
        const controller = editor.getContribution('editor.contrib.suggestController') as {
          model?: { state?: number };
        };
        if (controller?.model?.state) {
          editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
        } else {
          editor.trigger('keyboard', 'type', { text: '\t' });
        }
      });

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Space, () => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      });

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
        onRun?.();
      });

      editor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Enter,
        () => {
          onRunSelection?.();
        },
      );

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Equal, () => {
        const newFontSize = Math.min(2, preferences.fontSize + 0.1);
        updatePreference('fontSize', newFontSize);
      });

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Minus, () => {
        const newFontSize = Math.max(0.4, preferences.fontSize - 0.1);
        updatePreference('fontSize', newFontSize);
      });

      editor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyF,
        () => {
          if (editorRef.current) {
            formatSQLInEditor(editorRef.current);
          }
        },
      );

      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyI, () => {
        if (editorRef.current) {
          if (assistantVisible || structuredResponseVisible) {
            hideAIAssistant(editorRef.current);
          } else {
            showAIAssistant(editorRef.current);
          }
        }
      });

      const completionProvider = monacoInstance.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' ', '\n', '(', ','],
        provideCompletionItems: async (
          completionModel: monaco.editor.ITextModel,
          position: monaco.Position,
        ) => {
          try {
            const sqlText = completionModel.getValue();
            const cursorOffset = toUtf8Offset(sqlText, completionModel.getOffsetAt(position));
            const statementContext = await getStatementContext(sqlText, cursorOffset);
            const client = getFlowScopeClient();
            const context = await client.completion(
              statementContext.sql,
              statementContext.cursorOffset,
              schema,
            );

            const range = createCompletionRange(
              completionModel,
              context.token,
              position,
              statementContext.span?.start ?? 0,
            );
            const suggestions = buildCompletionItems(
              context,
              functionTooltips,
              range,
              getSchemaTables,
            );

            return { suggestions };
          } catch (error) {
            console.warn('Completion provider failed:', error);
            return { suggestions: [] };
          }
        },
      });

      const hoverProvider = monacoInstance.languages.registerHoverProvider('sql', {
        provideHover: async (hoverModel: monaco.editor.ITextModel, position: monaco.Position) => {
          try {
            const word = hoverModel.getWordAtPosition(position);
            if (!word) return null;

            const functionDoc = functionTooltips[word.word.toLowerCase()];
            if (functionDoc) {
              return {
                range: new monacoInstance.Range(
                  position.lineNumber,
                  word.startColumn,
                  position.lineNumber,
                  word.endColumn,
                ),
                contents: [
                  { value: `**${functionDoc.syntax}**` },
                  ...(functionDoc.description ? [{ value: functionDoc.description }] : []),
                  ...(functionDoc.example
                    ? [{ value: `\n\`\`\`sql\n${functionDoc.example}\n\`\`\`` }]
                    : []),
                ],
              };
            }

            const sqlText = hoverModel.getValue();
            const cursorOffset = toUtf8Offset(sqlText, hoverModel.getOffsetAt(position));
            const statementResult = await getStatementAnalysis(sqlText, cursorOffset);
            if (!statementResult?.analysis) return null;

            const [statement] = statementResult.analysis.statements;
            if (!statement) return null;

            const matchingNode = statement.nodes.find((node) => {
              if (node.type === 'column') return false;
              return node.label.toLowerCase() === word.word.toLowerCase();
            });

            if (!matchingNode) return null;

            const contents = [`**${matchingNode.type.toUpperCase()}: ${matchingNode.label}**`];
            if (matchingNode.qualifiedName && matchingNode.qualifiedName !== matchingNode.label) {
              contents.push(`\n*${matchingNode.qualifiedName}*`);
            }
            if (matchingNode.joinType) {
              contents.push(`\n**Join:** ${matchingNode.joinType}`);
            }
            if (matchingNode.joinCondition) {
              contents.push(`\n\`\`\`sql\nON ${matchingNode.joinCondition}\n\`\`\``);
            }
            if (matchingNode.filters?.length) {
              const filters = matchingNode.filters
                .map((filter) => `- \`${filter.expression}\` (${filter.clauseType})`)
                .join('\n');
              contents.push(`\n**Filters:**\n${filters}`);
            }

            return {
              range: new monacoInstance.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn,
              ),
              contents: contents.map((content) => ({ value: content })),
            };
          } catch (error) {
            console.warn('Hover provider failed:', error);
            return null;
          }
        },
      });

      disposablesRef.current.push(completionProvider, hoverProvider);
    };

    useEffect(() => {
      if (monacoRef.current) {
        monacoRef.current.editor.defineTheme(
          themeName,
          themeData as monaco.editor.IStandaloneThemeData,
        );
        monacoRef.current.editor.setTheme(themeName);
      }
    }, [themeName, themeData]);

    useEffect(() => {
      const model = editorRef.current?.getModel();
      if (model) {
        scheduleStatementSplit(model);
        scheduleFullAnalysis(model);
      }
    }, [path, scheduleFullAnalysis, scheduleStatementSplit]);

    useEffect(() => {
      if (editorRef.current) {
        editorRef.current.updateOptions({
          fontSize: preferences.fontSize * 16,
          fontWeight: getFontWeightValue(preferences.fontWeight as FontWeight),
        });
      }
    }, [preferences.fontSize, preferences.fontWeight]);

    const placeholderVisible =
      value.trim().length === 0 && !assistantVisible && !structuredResponseVisible;

    return (
      <div className="relative w-full h-full">
        {placeholderVisible && <div className="monaco-placeholder">{AI_WIDGET_PLACEHOLDER}</div>}
        <MonacoEditor
          value={value}
          defaultLanguage="sql"
          theme={themeName}
          path={path}
          onMount={handleEditorMount}
          onChange={(newValue?: string) => {
            if (typeof newValue === 'string') {
              onChange?.(newValue);
            }
          }}
          options={{
            readOnly,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            wordWrap: 'on',
          }}
        />
      </div>
    );
  },
);
