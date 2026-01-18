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
import { buildByteToCharMap, createOffsetConverter } from '@utils/editor/byte-offset';
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
import {
  CancelledError,
  getFlowScopeClient,
  terminateFlowScopeClient,
} from '../../workers/flowscope-client';
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
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const updateQuickOpenPositionVars = (editor: monaco.editor.IStandaloneCodeEditor) => {
  // Monaco quick input uses viewport coordinates when overflow widgets are fixed.
  if (typeof document === 'undefined') return;
  const editorDomNode = editor.getDomNode();
  if (!editorDomNode) return;

  const rect = editorDomNode.getBoundingClientRect();
  const root = document.documentElement;
  root.style.setProperty('--monaco-editor-left', `${rect.left}px`);
  root.style.setProperty('--monaco-editor-width', `${rect.width}px`);
};

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

  // Code folding: collapse multi-line statements for better navigation
  folding: true,
  foldingStrategy: 'auto',

  // Render widgets (signature help, hover) in fixed position to escape container overflow
  fixedOverflowWidgets: true,

  // Enable linked editing for simultaneous renaming of CTE/table references
  linkedEditing: true,

  // Show code lens (reference counts) above definitions
  codeLens: true,
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

/**
 * Checks if analysis contains a CTE with the given label.
 */
function hasCteWithLabel(
  analysis: import('@pondpilot/flowscope-core').AnalyzeResult,
  label: string,
): boolean {
  const targetLabel = label.toLowerCase();
  return analysis.statements.some((stmt) =>
    stmt.nodes.some((node) => node.type === 'cte' && node.label.toLowerCase() === targetLabel),
  );
}

/**
 * Parses text before cursor to find the function being called and the parameter index.
 * Used by signature help to show parameter hints.
 */
function getFunctionCallContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): { functionName: string; parameterIndex: number } | null {
  const lineContent = model.getLineContent(position.lineNumber);
  const textBeforeCursor = lineContent.substring(0, position.column - 1);

  let parenDepth = 0;
  let commaCount = 0;
  let funcNameEnd = -1;

  // Scan backwards to find the opening parenthesis
  for (let i = textBeforeCursor.length - 1; i >= 0; i -= 1) {
    const char = textBeforeCursor[i];
    if (char === ')') {
      parenDepth += 1;
    } else if (char === '(') {
      if (parenDepth === 0) {
        funcNameEnd = i;
        break;
      }
      parenDepth -= 1;
    } else if (char === ',' && parenDepth === 0) {
      commaCount += 1;
    }
  }

  if (funcNameEnd < 0) return null;

  // Extract function name before the opening parenthesis
  const beforeParen = textBeforeCursor.substring(0, funcNameEnd);
  const funcMatch = beforeParen.match(/(\w+)\s*$/);
  if (!funcMatch) return null;

  return { functionName: funcMatch[1].toLowerCase(), parameterIndex: commaCount };
}

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
        const modelValue = model.getValue();
        // Use cached converter for O(1) lookups when processing many nodes
        const converter = createOffsetConverter(modelValue);

        analysis.statements.forEach((statement) => {
          statement.nodes.forEach((node) => {
            if (
              !node.span ||
              (node.type !== 'table' && node.type !== 'view' && node.type !== 'cte')
            ) {
              return;
            }
            const startOffset = converter.fromUtf8(node.span.start);
            const endOffset = converter.fromUtf8(node.span.end);
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

        const modelValue = model.getValue();
        // Use cached converter for O(1) lookups when processing many issues
        const converter = createOffsetConverter(modelValue);
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

          const startOffset = converter.fromUtf8(issue.span.start);
          const endOffset = converter.fromUtf8(issue.span.end);
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
        // Capture cursor offset before async operation to avoid race condition
        // where cursor moves during the await
        const capturedCursorOffset = cursorOffsetRef.current;
        statementSplitTimerRef.current = window.setTimeout(async () => {
          if (!mountedRef.current) return;
          if (model.isDisposed()) return;
          try {
            const sqlText = model.getValue();
            await getStatementSpans(sqlText);
            if (!mountedRef.current) return;
            updateStatementHighlight(model, capturedCursorOffset);
          } catch (error) {
            if (!mountedRef.current) return;
            statementSpansRef.current = { sql: model.getValue(), spans: [], promise: null };
            updateStatementHighlight(model, capturedCursorOffset);
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
        // Terminate the FlowScope worker to free resources
        // Note: This is safe because FlowScopeClient is lazily initialized,
        // so a new worker will be created if needed after remounting
        terminateFlowScopeClient();
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
        minimap: { enabled: preferences.minimap, scale: 1, showSlider: 'mouseover' },
        automaticLayout: true,
        contextmenu: true,
      });

      const handleQuickOpenLayout = () => {
        updateQuickOpenPositionVars(editor);
      };

      handleQuickOpenLayout();

      const layoutDisposable = editor.onDidLayoutChange(handleQuickOpenLayout);
      window.addEventListener('resize', handleQuickOpenLayout);
      window.addEventListener('scroll', handleQuickOpenLayout, true);

      disposablesRef.current.push(layoutDisposable, {
        dispose: () => {
          window.removeEventListener('resize', handleQuickOpenLayout);
          window.removeEventListener('scroll', handleQuickOpenLayout, true);
        },
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
        triggerCharacters: ['.'],
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
            // Skip logging for cancelled requests (expected when user types quickly)
            if (!(error instanceof CancelledError)) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.warn('Completion provider failed:', message);
            }
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
            // Skip logging for cancelled requests (expected when user moves cursor quickly)
            if (!(error instanceof CancelledError)) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.warn('Hover provider failed:', message);
            }
            return null;
          }
        },
      });

      // Code folding provider: enables folding multi-line SQL statements
      // Resource limits to prevent performance issues on large documents
      const MAX_FOLDING_SPANS = 100000;
      const MAX_DOCUMENT_SIZE = 10_000_000; // 10MB

      const foldingProvider = monacoInstance.languages.registerFoldingRangeProvider('sql', {
        provideFoldingRanges: async (model, _context, token) => {
          try {
            if (token.isCancellationRequested) return [];

            const sqlText = model.getValue();

            // Skip folding for very large documents to prevent UI lag
            if (sqlText.length > MAX_DOCUMENT_SIZE) {
              return [];
            }
            const spans = await getStatementSpans(sqlText);

            if (token.isCancellationRequested) return [];
            if (spans.length === 0) return [];

            // Resource exhaustion protection
            if (spans.length > MAX_FOLDING_SPANS) {
              console.warn(`Too many statements for folding (${spans.length}), skipping`);
              return [];
            }

            // Collect unique byte offsets for batch conversion
            const byteOffsets = new Set<number>();
            for (const span of spans) {
              byteOffsets.add(span.start);
              byteOffsets.add(span.end);
            }

            // Build byte-to-char map using shared utility
            const byteToCharMap = buildByteToCharMap(sqlText, Array.from(byteOffsets));

            const ranges: monaco.languages.FoldingRange[] = [];
            for (const span of spans) {
              // Check cancellation inside loop for large documents
              if (token.isCancellationRequested) return ranges;

              const startCharOffset = byteToCharMap.get(span.start);
              const endCharOffset = byteToCharMap.get(span.end);

              // Warn on missing mappings instead of silently defaulting
              if (startCharOffset === undefined || endCharOffset === undefined) {
                console.warn('Missing byte-to-char mapping for folding span:', {
                  start: span.start,
                  end: span.end,
                });
                continue;
              }

              const startPos = model.getPositionAt(startCharOffset);
              const endPos = model.getPositionAt(endCharOffset);

              // Only fold multi-line statements
              if (endPos.lineNumber > startPos.lineNumber) {
                ranges.push({
                  start: startPos.lineNumber,
                  end: endPos.lineNumber,
                  kind: monacoInstance.languages.FoldingRangeKind.Region,
                });
              }
            }
            return ranges;
          } catch (error) {
            // Graceful degradation: return empty ranges on parser failure
            // Skip logging for cancelled requests (expected when user types quickly)
            if (!(error instanceof CancelledError)) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.warn('Folding provider failed:', message);
            }
            return [];
          }
        },
      });

      // Signature help provider: shows parameter hints for SQL functions
      const signatureHelpProvider = monacoInstance.languages.registerSignatureHelpProvider('sql', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],

        provideSignatureHelp: async (model, position) => {
          const context = getFunctionCallContext(model, position);
          if (!context) return null;

          const funcDoc = functionTooltips[context.functionName];
          if (!funcDoc) return null;

          // Parse parameters from function syntax (e.g., "SUM(expression)" -> ["expression"])
          const paramMatch = funcDoc.syntax.match(/\(([^)]*)\)/);
          const params = paramMatch ? paramMatch[1].split(',').map((p) => p.trim()) : [];

          return {
            value: {
              signatures: [
                {
                  label: funcDoc.syntax,
                  documentation: funcDoc.description,
                  parameters: params.map((param) => ({ label: param })),
                },
              ],
              activeSignature: 0,
              activeParameter: Math.min(context.parameterIndex, params.length - 1),
            },
            dispose: () => {},
          };
        },
      });

      // Go to definition provider: navigate to CTE definitions
      const definitionProvider = monacoInstance.languages.registerDefinitionProvider('sql', {
        provideDefinition: async (model, position) => {
          const sqlText = model.getValue();
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const analysis = await getFlowScopeAnalysis(sqlText);
          if (!analysis) return null;

          if (!hasCteWithLabel(analysis, word.word)) return null;

          // FlowScope doesn't provide spans for CTEs, so search for definition in text
          // Match patterns like "WITH cte_name AS" or ", cte_name AS"
          const pattern = `(?:WITH|,)\\s+(${word.word})\\s+AS\\s*\\(`;
          const cteRegex = new RegExp(pattern, 'gi');
          const match = cteRegex.exec(sqlText);

          if (match) {
            // Find the position of the CTE name within the match
            const cteNameStart = match.index + match[0].indexOf(match[1]);
            const cteNameEnd = cteNameStart + match[1].length;
            const startPos = model.getPositionAt(cteNameStart);
            const endPos = model.getPositionAt(cteNameEnd);

            return {
              uri: model.uri,
              range: new monacoInstance.Range(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column,
              ),
            };
          }

          return null;
        },
      });

      // Find all references provider: locate all usages of a table, CTE, or view
      const referenceProvider = monacoInstance.languages.registerReferenceProvider('sql', {
        provideReferences: async (model, position) => {
          const sqlText = model.getValue();
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const analysis = await getFlowScopeAnalysis(sqlText);
          if (!analysis) return null;

          const references: monaco.languages.Location[] = [];
          const targetLabel = word.word.toLowerCase();
          const converter = createOffsetConverter(sqlText);

          // Find all nodes matching the label (tables, CTEs, views)
          for (const statement of analysis.statements) {
            for (const node of statement.nodes) {
              if (
                (node.type === 'table' || node.type === 'cte' || node.type === 'view') &&
                node.label.toLowerCase() === targetLabel &&
                node.span
              ) {
                const startOffset = converter.fromUtf8(node.span.start);
                const endOffset = converter.fromUtf8(node.span.end);
                const startPos = model.getPositionAt(startOffset);
                const endPos = model.getPositionAt(endOffset);

                references.push({
                  uri: model.uri,
                  range: new monacoInstance.Range(
                    startPos.lineNumber,
                    startPos.column,
                    endPos.lineNumber,
                    endPos.column,
                  ),
                });
              }
            }
          }

          // For CTEs without spans, use text search as fallback
          if (hasCteWithLabel(analysis, targetLabel) && references.length === 0) {
            // Search for all occurrences of the CTE name as a word
            const wordPattern = new RegExp(`\\b${word.word}\\b`, 'gi');
            let match;
            while ((match = wordPattern.exec(sqlText)) !== null) {
              const startPos = model.getPositionAt(match.index);
              const endPos = model.getPositionAt(match.index + match[0].length);
              references.push({
                uri: model.uri,
                range: new monacoInstance.Range(
                  startPos.lineNumber,
                  startPos.column,
                  endPos.lineNumber,
                  endPos.column,
                ),
              });
            }
          }

          return references;
        },
      });

      // Document symbol provider: outline view and breadcrumb navigation (Ctrl+Shift+O)
      const documentSymbolProvider = monacoInstance.languages.registerDocumentSymbolProvider(
        'sql',
        {
          provideDocumentSymbols: async (model) => {
            const sqlText = model.getValue();
            const spans = await getStatementSpans(sqlText);
            if (spans.length === 0) return [];

            const symbols: monaco.languages.DocumentSymbol[] = [];
            const converter = createOffsetConverter(sqlText);

            for (let i = 0; i < spans.length; i += 1) {
              const span = spans[i];
              const startOffset = converter.fromUtf8(span.start);
              const endOffset = converter.fromUtf8(span.end);
              const startPos = model.getPositionAt(startOffset);
              const endPos = model.getPositionAt(endOffset);
              const statementText = sqlText.slice(startOffset, endOffset);

              // Determine statement type from first keyword
              const firstWord = statementText.trim().split(/\s+/)[0]?.toUpperCase() || 'STATEMENT';
              let symbolKind = monacoInstance.languages.SymbolKind.Function;
              let statementName = `${firstWord} (${i + 1})`;

              // Try to extract a more meaningful name
              if (firstWord === 'WITH') {
                // Extract CTE names
                const cteMatch = statementText.match(/WITH\s+(\w+)/i);
                if (cteMatch) {
                  statementName = `WITH ${cteMatch[1]}`;
                  symbolKind = monacoInstance.languages.SymbolKind.Module;
                }
              } else if (firstWord === 'CREATE') {
                const createMatch = statementText.match(
                  /CREATE\s+(?:OR\s+REPLACE\s+)?(\w+)\s+(\w+)/i,
                );
                if (createMatch) {
                  statementName = `CREATE ${createMatch[1]} ${createMatch[2]}`;
                  symbolKind = monacoInstance.languages.SymbolKind.Class;
                }
              } else if (firstWord === 'INSERT') {
                const insertMatch = statementText.match(/INSERT\s+INTO\s+(\w+)/i);
                if (insertMatch) {
                  statementName = `INSERT INTO ${insertMatch[1]}`;
                  symbolKind = monacoInstance.languages.SymbolKind.Method;
                }
              } else if (firstWord === 'UPDATE') {
                const updateMatch = statementText.match(/UPDATE\s+(\w+)/i);
                if (updateMatch) {
                  statementName = `UPDATE ${updateMatch[1]}`;
                  symbolKind = monacoInstance.languages.SymbolKind.Method;
                }
              } else if (firstWord === 'DELETE') {
                const deleteMatch = statementText.match(/DELETE\s+FROM\s+(\w+)/i);
                if (deleteMatch) {
                  statementName = `DELETE FROM ${deleteMatch[1]}`;
                  symbolKind = monacoInstance.languages.SymbolKind.Method;
                }
              } else if (firstWord === 'SELECT') {
                // Try to find the main table in FROM clause
                const fromMatch = statementText.match(/FROM\s+(\w+)/i);
                if (fromMatch) {
                  statementName = `SELECT FROM ${fromMatch[1]}`;
                }
                symbolKind = monacoInstance.languages.SymbolKind.Function;
              }

              const range = new monacoInstance.Range(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column,
              );

              symbols.push({
                name: statementName,
                detail: `Line ${startPos.lineNumber}`,
                kind: symbolKind,
                range,
                selectionRange: range,
                tags: [],
              });
            }

            return symbols;
          },
        },
      );

      // Rename provider: F2 to rename CTEs across all references
      const renameProvider = monacoInstance.languages.registerRenameProvider('sql', {
        provideRenameEdits: async (model, position, newName) => {
          const sqlText = model.getValue();
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const analysis = await getFlowScopeAnalysis(sqlText);
          if (!analysis) return null;

          if (!hasCteWithLabel(analysis, word.word)) return null;

          const targetLabel = word.word.toLowerCase();
          const edits: monaco.languages.IWorkspaceTextEdit[] = [];
          const converter = createOffsetConverter(sqlText);

          // Find all occurrences with spans
          for (const statement of analysis.statements) {
            for (const node of statement.nodes) {
              if (
                (node.type === 'table' || node.type === 'cte') &&
                node.label.toLowerCase() === targetLabel &&
                node.span
              ) {
                const startOffset = converter.fromUtf8(node.span.start);
                const endOffset = converter.fromUtf8(node.span.end);
                const startPos = model.getPositionAt(startOffset);
                const endPos = model.getPositionAt(endOffset);

                edits.push({
                  resource: model.uri,
                  versionId: undefined,
                  textEdit: {
                    range: new monacoInstance.Range(
                      startPos.lineNumber,
                      startPos.column,
                      endPos.lineNumber,
                      endPos.column,
                    ),
                    text: newName,
                  },
                });
              }
            }
          }

          // For CTEs without spans, use text search as fallback
          if (edits.length === 0) {
            const wordPattern = new RegExp(`\\b${word.word}\\b`, 'gi');
            let match;
            while ((match = wordPattern.exec(sqlText)) !== null) {
              const startPos = model.getPositionAt(match.index);
              const endPos = model.getPositionAt(match.index + match[0].length);
              edits.push({
                resource: model.uri,
                versionId: undefined,
                textEdit: {
                  range: new monacoInstance.Range(
                    startPos.lineNumber,
                    startPos.column,
                    endPos.lineNumber,
                    endPos.column,
                  ),
                  text: newName,
                },
              });
            }
          }

          return { edits };
        },
      });

      // Code lens provider: show reference counts above CTE definitions
      const codeLensProvider = monacoInstance.languages.registerCodeLensProvider('sql', {
        provideCodeLenses: async (model) => {
          const sqlText = model.getValue();
          const analysis = await getFlowScopeAnalysis(sqlText);
          if (!analysis) return { lenses: [], dispose: () => {} };

          const lenses: monaco.languages.CodeLens[] = [];

          // Find all CTEs and count their references
          const cteReferences = new Map<string, number>();
          const cteDefinitionRanges = new Map<string, monaco.IRange>();

          for (const statement of analysis.statements) {
            for (const node of statement.nodes) {
              if (node.type === 'cte') {
                const label = node.label.toLowerCase();
                cteReferences.set(label, (cteReferences.get(label) || 0) + 1);
              }
            }
          }

          // Find CTE definition positions using regex
          for (const [cteName] of cteReferences) {
            const pattern = `(?:WITH|,)\\s+(${cteName})\\s+AS\\s*\\(`;
            const cteRegex = new RegExp(pattern, 'gi');
            const match = cteRegex.exec(sqlText);

            if (match) {
              const cteNameStart = match.index + match[0].indexOf(match[1]);
              const startPos = model.getPositionAt(cteNameStart);
              cteDefinitionRanges.set(cteName, {
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: startPos.lineNumber,
                endColumn: startPos.column + match[1].length,
              });
            }
          }

          // Create code lenses for CTEs with multiple references
          for (const [cteName, count] of cteReferences) {
            const definitionRange = cteDefinitionRanges.get(cteName);
            // Only show lens if there are references (count > 1 means 1 definition + references)
            if (definitionRange && count > 1) {
              const refCount = count - 1; // Subtract the definition itself
              lenses.push({
                range: definitionRange,
                command: {
                  id: 'editor.action.findReferences',
                  title: `${refCount} reference${refCount === 1 ? '' : 's'}`,
                  arguments: [
                    model.uri,
                    new monacoInstance.Position(
                      definitionRange.startLineNumber,
                      definitionRange.startColumn,
                    ),
                  ],
                },
              });
            }
          }

          return { lenses, dispose: () => {} };
        },
      });

      // Linked editing ranges provider: edit all occurrences of a CTE/table name simultaneously
      const linkedEditingProvider = monacoInstance.languages.registerLinkedEditingRangeProvider(
        'sql',
        {
          provideLinkedEditingRanges: async (model, position) => {
            const sqlText = model.getValue();
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const analysis = await getFlowScopeAnalysis(sqlText);
            if (!analysis) return null;

            const targetLabel = word.word.toLowerCase();
            const ranges: monaco.IRange[] = [];
            const converter = createOffsetConverter(sqlText);

            // Check if this is a CTE, table, or view
            const isLinkedIdentifier = analysis.statements.some((stmt) =>
              stmt.nodes.some(
                (node) =>
                  (node.type === 'cte' || node.type === 'table' || node.type === 'view') &&
                  node.label.toLowerCase() === targetLabel,
              ),
            );

            if (!isLinkedIdentifier) return null;

            // Find all occurrences with spans
            for (const statement of analysis.statements) {
              for (const node of statement.nodes) {
                if (
                  (node.type === 'table' || node.type === 'cte' || node.type === 'view') &&
                  node.label.toLowerCase() === targetLabel &&
                  node.span
                ) {
                  const startOffset = converter.fromUtf8(node.span.start);
                  const endOffset = converter.fromUtf8(node.span.end);
                  const startPos = model.getPositionAt(startOffset);
                  const endPos = model.getPositionAt(endOffset);

                  ranges.push(
                    new monacoInstance.Range(
                      startPos.lineNumber,
                      startPos.column,
                      endPos.lineNumber,
                      endPos.column,
                    ),
                  );
                }
              }
            }

            // For CTEs without spans, use text search as fallback
            if (hasCteWithLabel(analysis, targetLabel) && ranges.length === 0) {
              const wordPattern = new RegExp(`\\b${word.word}\\b`, 'gi');

              let match;
              while ((match = wordPattern.exec(sqlText)) !== null) {
                const startPos = model.getPositionAt(match.index);
                const endPos = model.getPositionAt(match.index + match[0].length);
                ranges.push(
                  new monacoInstance.Range(
                    startPos.lineNumber,
                    startPos.column,
                    endPos.lineNumber,
                    endPos.column,
                  ),
                );
              }
            }

            if (ranges.length < 2) return null;

            return { ranges, wordPattern: undefined };
          },
        },
      );

      disposablesRef.current.push(
        completionProvider,
        hoverProvider,
        foldingProvider,
        signatureHelpProvider,
        definitionProvider,
        referenceProvider,
        documentSymbolProvider,
        renameProvider,
        codeLensProvider,
        linkedEditingProvider,
      );
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
          minimap: { enabled: preferences.minimap, scale: 1, showSlider: 'mouseover' },
        });
      }
    }, [preferences.fontSize, preferences.fontWeight, preferences.minimap]);

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
            minimap: { enabled: preferences.minimap, scale: 1, showSlider: 'mouseover' },
          }}
        />
      </div>
    );
  },
);
