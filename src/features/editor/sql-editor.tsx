/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Modified by Andrii Butko (C) [2025]
 * Licensed under GNU AGPL v3.0
 */
import { formatSQLInEditor } from '@controllers/sql-formatter';
import { useEditorPreferences } from '@hooks/use-editor-preferences';
import MonacoEditor from '@monaco-editor/react';
import type { CompletionItemsResult, Span } from '@pondpilot/flowscope-core';
import { useAppStore } from '@store/app-store';
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

type CompletionItem = CompletionItemsResult['items'][number];
type CompletionItemKind = CompletionItem['kind'];

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

/**
 * Detects user's preference for reduced motion (accessibility setting).
 * Used to disable animations for users who prefer reduced motion.
 */
const getPrefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Shared Monaco editor options for SQL editing.
 * These provide enhanced UX features like bracket colorization and guides.
 *
 * @param prefersReducedMotion - Whether to disable animations for accessibility
 */
const createSqlEditorOptions = (
  prefersReducedMotion: boolean,
): monaco.editor.IStandaloneEditorConstructionOptions => ({
  scrollBeyondLastLine: false,
  wordWrap: 'on',

  // Bracket pair colorization: color-coded parentheses help visualize nested subqueries
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: true,
  },

  // Bracket guides: visual lines connecting matching brackets for complex SQL
  guides: {
    bracketPairs: true,
    bracketPairsHorizontal: 'active',
    highlightActiveBracketPair: true,
    indentation: true,
    highlightActiveIndentation: true,
  },

  // Selection highlighting: select text to see all occurrences in the document
  occurrencesHighlight: 'singleFile',
  selectionHighlight: true,

  // Quick suggestions: auto-trigger completions while typing (disabled in comments to reduce noise)
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  // 100ms delay balances responsiveness with performance
  quickSuggestionsDelay: 100,

  // Smooth animations (disabled when user prefers reduced motion)
  smoothScrolling: !prefersReducedMotion,
  cursorBlinking: prefersReducedMotion ? 'blink' : 'smooth',
  cursorSmoothCaretAnimation: prefersReducedMotion ? 'off' : 'on',

  // Cursor width of 2px provides good visibility without being intrusive
  cursorWidth: 2,

  // Vertical padding provides breathing room at document edges
  padding: {
    top: 8,
    bottom: 8,
  },
});

const createCompletionRange = (
  model: monaco.editor.ITextModel,
  contextToken: CompletionItemsResult['token'],
  position: monaco.Position,
  tokenBaseOffset: number = 0,
  triggerChar?: string,
): monaco.IRange => {
  if (!contextToken) {
    const word = model.getWordUntilPosition(position);
    const startColumn = word?.startColumn ?? position.column;
    const endColumn = word?.endColumn ?? position.column;
    return new monaco.Range(position.lineNumber, startColumn, position.lineNumber, endColumn);
  }

  const modelValue = model.getValue();
  const startOffset = fromUtf8Offset(modelValue, contextToken.span.start + tokenBaseOffset);
  const endOffset = fromUtf8Offset(modelValue, contextToken.span.end + tokenBaseOffset);
  const startPos = model.getPositionAt(startOffset);
  const endPos = model.getPositionAt(endOffset);

  if (triggerChar === '.') {
    const rangeText = modelValue.slice(startOffset, endOffset);
    const lastDotIndex = rangeText.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      const adjustedStartOffset = startOffset + lastDotIndex + 1;
      const adjustedStartPos = model.getPositionAt(adjustedStartOffset);
      return new monaco.Range(
        adjustedStartPos.lineNumber,
        adjustedStartPos.column,
        endPos.lineNumber,
        endPos.column,
      );
    }
  }

  return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
};

// Centralized metadata for completion item kinds - maps kind to Monaco icon and default detail text
const COMPLETION_KIND_META: Record<
  CompletionItemKind,
  { monacoKind: monaco.languages.CompletionItemKind; defaultDetail: string }
> = {
  keyword: { monacoKind: monaco.languages.CompletionItemKind.Keyword, defaultDetail: 'keyword' },
  operator: { monacoKind: monaco.languages.CompletionItemKind.Operator, defaultDetail: 'operator' },
  function: { monacoKind: monaco.languages.CompletionItemKind.Function, defaultDetail: 'function' },
  snippet: { monacoKind: monaco.languages.CompletionItemKind.Snippet, defaultDetail: 'snippet' },
  table: { monacoKind: monaco.languages.CompletionItemKind.Struct, defaultDetail: 'table' },
  // schemaTable uses Module to visually distinguish schema-qualified tables from plain tables
  schemaTable: {
    monacoKind: monaco.languages.CompletionItemKind.Module,
    defaultDetail: 'schema table',
  },
  column: { monacoKind: monaco.languages.CompletionItemKind.Field, defaultDetail: 'column' },
};

const mapCompletionItemKind = (kind: CompletionItemKind): monaco.languages.CompletionItemKind =>
  COMPLETION_KIND_META[kind]?.monacoKind ?? monaco.languages.CompletionItemKind.Text;

const getCompletionDetail = (item: CompletionItem): string | undefined =>
  item.detail ?? COMPLETION_KIND_META[item.kind]?.defaultDetail;

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

    const getStatementContextFromCache = useCallback(
      (sqlText: string, cursorOffset: number) => {
        const spansCache = statementSpansRef.current;
        if (spansCache.sql !== sqlText || spansCache.spans.length === 0) {
          return null;
        }

        const span = findStatementSpan(spansCache.spans, cursorOffset);
        if (!span) {
          return null;
        }

        const startIndex = fromUtf8Offset(sqlText, span.start);
        const endIndex = fromUtf8Offset(sqlText, span.end);
        return {
          sql: sqlText.slice(startIndex, endIndex),
          cursorOffset: Math.max(0, cursorOffset - span.start),
          span,
        };
      },
      [findStatementSpan],
    );

    const getStatementContext = useCallback(
      async (sqlText: string, cursorOffset: number) => {
        const cachedContext = getStatementContextFromCache(sqlText, cursorOffset);
        if (cachedContext) {
          return cachedContext;
        }

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
      [findStatementSpan, getStatementContextFromCache, getStatementSpans],
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

        const getMarkerSeverity = (severity: string): monaco.MarkerSeverity => {
          switch (severity) {
            case 'error':
              return monaco.MarkerSeverity.Error;
            case 'warning':
              return monaco.MarkerSeverity.Warning;
            default:
              return monaco.MarkerSeverity.Info;
          }
        };

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
            severity: getMarkerSeverity(issue.severity),
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
        ...createSqlEditorOptions(getPrefersReducedMotion()),
        fontSize: preferences.fontSize * 16,
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: getFontWeightValue(preferences.fontWeight as FontWeight),
        readOnly,
        minimap: { enabled: false },
        automaticLayout: true,
        contextmenu: true,
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
        triggerCharacters: ['.', '(', ','],
        provideCompletionItems: async (
          completionModel: monaco.editor.ITextModel,
          position: monaco.Position,
          completionContextInfo,
        ) => {
          try {
            const sqlText = completionModel.getValue();
            const absoluteOffset = completionModel.getOffsetAt(position);
            const cursorOffset = toUtf8Offset(sqlText, absoluteOffset);

            let statementContext = getStatementContextFromCache(sqlText, cursorOffset);
            if (!statementContext) {
              if (!sqlText.trim()) {
                return { suggestions: [] };
              }

              const fallbackContext = await getStatementContext(sqlText, cursorOffset);
              if (fallbackContext.span) {
                statementContext = fallbackContext;
              }
            }

            const triggerChar = completionContextInfo?.triggerCharacter;
            const contextTooShort =
              statementContext && statementContext.cursorOffset > statementContext.sql.length;
            if ((triggerChar === '.' || contextTooShort) && sqlText.trim()) {
              const fallbackContext = await getStatementContext(sqlText, cursorOffset);
              if (fallbackContext.span) {
                statementContext = fallbackContext;
              }
            }

            if (!statementContext || !statementContext.sql.trim()) {
              return { suggestions: [] };
            }

            const client = getFlowScopeClient();
            const result = await client.completionItems(
              statementContext.sql,
              statementContext.cursorOffset,
              schema,
            );

            if (!result.shouldShow) {
              return { suggestions: [] };
            }

            const range = createCompletionRange(
              completionModel,
              result.token,
              position,
              statementContext.span?.start ?? 0,
              triggerChar,
            );

            const suggestions = result.items.map((item: CompletionItem) => ({
              label: item.label,
              kind: mapCompletionItemKind(item.kind),
              insertText: item.insertText,
              detail: getCompletionDetail(item),
              range,
            }));

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

    return (
      <div className="relative w-full h-full">
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
            ...createSqlEditorOptions(getPrefersReducedMotion()),
            readOnly,
            minimap: { enabled: false },
          }}
        />
      </div>
    );
  },
);
