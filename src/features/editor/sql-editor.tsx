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
import { safeSliceBySpan, isSpanValid, type Utf16Span } from '@utils/editor/spans';
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
  getCompletionClient,
  terminateFlowScopeClients,
} from '../../workers/flowscope-client';
import { useDuckDBConnectionPool } from '../duckdb-context/duckdb-context';

type FunctionTooltip = Record<string, { syntax: string; description: string; example?: string }>;

// Documents larger than this threshold skip expensive operations (full analyze, split,
// code lens, linked editing) to avoid blocking the FlowScope worker for seconds.
// Incremental spans and local semicolon scanning handle these documents instead.
const LARGE_DOCUMENT_THRESHOLD = 50_000; // 50KB

// Maximum character delta between incremental baseline and current SQL
// for which we still consider incremental spans usable. Allows spans
// to remain valid across a short burst of keystrokes before the next
// full split completes.
const INCREMENTAL_SPAN_TOLERANCE = 100;

// Debounce interval for full statement re-split after edits.
// Longer than typical debounce because incremental spans handle
// immediate highlighting and completion needs. The full re-split
// only runs to correct accumulated drift.
const FULL_SPLIT_DEBOUNCE_MS = 2000;

// Debug logging for completion performance analysis
// Set to true to see timing information in console
const DEBUG_COMPLETION = false;

function debugLog(label: string, ...args: unknown[]) {
  if (DEBUG_COMPLETION) {
    // eslint-disable-next-line no-console
    console.debug(`[Completion] ${label}`, ...args);
  }
}

/**
 * Incremental span tracking for efficient statement splitting.
 * Instead of re-parsing the entire document on every keystroke,
 * we adjust existing spans based on edit deltas.
 */
type IncrementalSpanState = {
  // The SQL text when spans were last fully computed
  baselineSql: string;
  // Current spans (may be from full split or incrementally adjusted)
  spans: Span[];
};

/**
 * Adjusts spans after a text edit without re-parsing.
 * Returns adjusted spans, or null if a full re-split is needed.
 */
function adjustSpansForEdit(
  spans: Span[],
  editOffset: number,
  oldLength: number,
  newLength: number,
  newText: string,
  oldText: string,
): Span[] | null {
  // If semicolons were added or removed, statement boundaries may have changed
  const oldSemicolons = (oldText.match(/;/g) || []).length;
  const newSemicolons = (newText.match(/;/g) || []).length;
  if (oldSemicolons !== newSemicolons) {
    debugLog(
      `adjustSpans: semicolon count changed (${oldSemicolons} -> ${newSemicolons}), need full re-split`,
    );
    return null;
  }

  const delta = newLength - oldLength;
  if (delta === 0 && spans.length > 0) {
    // Same-length replacement, spans unchanged
    return spans;
  }

  const adjustedSpans: Span[] = [];

  for (const span of spans) {
    if (span.end <= editOffset) {
      // Span is entirely before the edit, unchanged
      adjustedSpans.push(span);
    } else if (span.start >= editOffset + oldLength) {
      // Span is entirely after the edit, shift by delta
      adjustedSpans.push({
        start: span.start + delta,
        end: span.end + delta,
      });
    } else {
      // Edit is within or overlaps this span - adjust the end
      const newEnd = span.end + delta;
      adjustedSpans.push({
        start: span.start,
        end: Math.max(span.start + 1, newEnd),
      });
    }
  }

  debugLog(`adjustSpans: adjusted ${spans.length} spans by delta ${delta}`);
  return adjustedSpans;
}

/**
 * Context for a SQL statement at a cursor position.
 * Used by completion and other providers to scope operations to the current statement.
 */
type StatementContext = {
  sql: string;
  cursorOffset: number;
  span: Span | null;
};

/**
 * Fast local extraction of the SQL statement around a cursor position.
 * Scans backwards and forwards for semicolons to find statement boundaries.
 * Used as a fallback when no parsed spans are available, to avoid sending
 * the entire document to the completion engine.
 *
 * Note: This is a lexical semicolon-only scan that does not understand SQL
 * quoting or comments. It may produce incorrect boundaries for SQL containing
 * semicolons inside string literals or comments, but is sufficient as a
 * best-effort fallback for completions.
 */
function extractStatementAroundCursor(sql: string, cursorOffset: number): StatementContext {
  // Scan backwards for the nearest semicolon (or start of document)
  let start = 0;
  for (let i = cursorOffset - 1; i >= 0; i -= 1) {
    if (sql[i] === ';') {
      start = i + 1;
      break;
    }
  }

  // Scan forwards for the nearest semicolon (or end of document)
  let end = sql.length;
  for (let i = cursorOffset; i < sql.length; i += 1) {
    if (sql[i] === ';') {
      end = i + 1;
      break;
    }
  }

  const statementSql = sql.slice(start, end);
  return {
    sql: statementSql,
    cursorOffset: cursorOffset - start,
    span: { start, end },
  };
}

/**
 * Wraps a Monaco provider function with error handling.
 * Catches CancelledError silently (expected during rapid typing) and logs other errors.
 */
async function withProviderErrorHandling<T>(
  providerName: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof CancelledError)) {
      console.warn(`${providerName} failed:`, error);
    }
    return fallback;
  }
}

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
 * Converts a UTF-16 span to a Monaco Range.
 * Returns null if the span is missing or invalid.
 *
 * @param model - The Monaco text model
 * @param span - The span to convert (may be null/undefined)
 * @returns A Monaco Range, or null if span is invalid
 */
function spanToRange(
  model: monaco.editor.ITextModel,
  span: Utf16Span | null | undefined,
): monaco.Range | null {
  if (!span) return null;

  const textLength = model.getValue().length;
  if (span.start < 0 || span.end > textLength || span.start > span.end) {
    return null;
  }

  const startPos = model.getPositionAt(span.start);
  const endPos = model.getPositionAt(span.end);

  return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
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

  const startOffset = contextToken.span.start + tokenBaseOffset;
  const endOffset = contextToken.span.end + tokenBaseOffset;
  const startPos = model.getPositionAt(startOffset);
  const endPos = model.getPositionAt(endOffset);

  if (triggerChar === '.') {
    const modelValue = model.getValue();
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
    // Incremental span tracking - avoids re-parsing entire document on each keystroke
    const incrementalSpansRef = useRef<IncrementalSpanState>({
      baselineSql: '',
      spans: [],
    });
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
        debugLog('split: empty SQL');
        return [];
      }
      if (cache.sql === sqlText && cache.spans.length > 0) {
        debugLog('split: cache hit (spans ready)', cache.spans.length, 'statements');
        return cache.spans;
      }
      if (cache.sql === sqlText && cache.promise) {
        debugLog('split: cache hit (awaiting pending)');
        return cache.promise;
      }

      debugLog('split: cache miss, calling FlowScope for', sqlText.length, 'chars');
      const splitStart = performance.now();
      const client = getFlowScopeClient();
      cache.sql = sqlText;
      cache.promise = client
        .split(sqlText)
        .then((result) => {
          const elapsed = performance.now() - splitStart;
          debugLog(
            'split: completed in',
            `${elapsed.toFixed(1)}ms,`,
            result.statements.length,
            'statements',
          );
          cache.spans = result.statements;
          syncIncrementalFromFullSplit(sqlText, result.statements);
          cache.promise = null;
          return result.statements;
        })
        .catch((error: Error) => {
          const elapsed = performance.now() - splitStart;
          debugLog('split: failed after', `${elapsed.toFixed(1)}ms`, error.message);
          cache.spans = [];
          cache.promise = null;
          throw error;
        });

      return cache.promise ?? [];
    }, []);

    /**
     * Apply an incremental edit to the tracked spans.
     * This is called on every content change to keep spans approximately correct.
     */
    const applyIncrementalEdit = useCallback(
      (
        oldSql: string,
        newSql: string,
        changes: readonly { rangeOffset: number; rangeLength: number; text: string }[],
      ) => {
        const state = incrementalSpansRef.current;

        // If we have no spans yet, nothing to adjust
        if (state.spans.length === 0) {
          debugLog('incremental: no spans to adjust');
          return;
        }

        let currentSpans = state.spans;
        let cumulativeOffset = 0;

        // Monaco provides event.changes with rangeOffset relative to the
        // *original* document (before the edit). When multiple changes occur
        // in one event (e.g. multi-cursor), we apply them in ascending offset
        // order and track a cumulative delta so that each subsequent change
        // maps correctly into the already-shifted span positions.
        const sortedChanges = [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset);

        for (const change of sortedChanges) {
          const editOffset = change.rangeOffset + cumulativeOffset;
          const oldLength = change.rangeLength;
          const newLength = change.text.length;

          // Get the old text that was replaced
          const oldText = oldSql.substring(
            change.rangeOffset,
            change.rangeOffset + change.rangeLength,
          );

          const adjustedSpans = adjustSpansForEdit(
            currentSpans,
            editOffset,
            oldLength,
            newLength,
            change.text,
            oldText,
          );

          if (adjustedSpans === null) {
            // Semicolons changed - keep using old spans until full re-split completes
            debugLog('incremental: need full re-split (semicolons changed)');
            return;
          }

          currentSpans = adjustedSpans;
          cumulativeOffset += newLength - oldLength;
        }

        // Update state with adjusted spans
        state.spans = currentSpans;
        state.baselineSql = newSql;
        debugLog(
          'incremental: adjusted spans successfully, now have',
          currentSpans.length,
          'statements',
        );
      },
      [],
    );

    /**
     * Get spans from incremental tracking, falling back to full split cache.
     * This returns immediately without waiting for any async operations.
     */
    const getSpansImmediate = useCallback((sqlText: string): Span[] | null => {
      // First check the incremental state
      const incState = incrementalSpansRef.current;
      if (incState.spans.length > 0 && incState.baselineSql === sqlText) {
        debugLog(`getSpansImmediate: using incremental spans (${incState.spans.length})`);
        return incState.spans;
      }

      // Fall back to the full split cache
      const cache = statementSpansRef.current;
      if (cache.spans.length > 0 && cache.sql === sqlText) {
        debugLog(`getSpansImmediate: using cached spans (${cache.spans.length})`);
        return cache.spans;
      }

      // Check if incremental spans are close enough to still be usable
      const lengthDelta = Math.abs(incState.baselineSql.length - sqlText.length);
      if (incState.spans.length > 0 && lengthDelta < INCREMENTAL_SPAN_TOLERANCE) {
        debugLog(
          `getSpansImmediate: using stale incremental spans (delta: ${sqlText.length - incState.baselineSql.length} chars)`,
        );
        return incState.spans;
      }

      debugLog('getSpansImmediate: no spans available');
      return null;
    }, []);

    /**
     * Sync incremental state from a completed full split.
     * Only applies if the document hasn't changed since the split was requested,
     * to avoid overwriting newer incremental adjustments with stale data.
     */
    const syncIncrementalFromFullSplit = useCallback((sqlText: string, spans: Span[]) => {
      const state = incrementalSpansRef.current;
      // Guard against stale syncs: if the user has edited since this split
      // was requested, the incremental state is more current - skip the sync
      const currentSql = editorRef.current?.getModel()?.getValue();
      if (currentSql !== undefined && currentSql !== sqlText) {
        debugLog('incremental: skipping stale full split sync');
        return;
      }
      state.baselineSql = sqlText;
      state.spans = spans;
      debugLog(`incremental: synced from full split (${spans.length} statements)`);
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
        // Use incremental spans if available (instant, no waiting)
        const spans = getSpansImmediate(sqlText);
        if (!spans || spans.length === 0) {
          return null;
        }

        const span = findStatementSpan(spans, cursorOffset);
        if (!span) {
          return null;
        }

        const statementSql = safeSliceBySpan(sqlText, span, 'statement context');
        return {
          sql: statementSql ?? sqlText,
          cursorOffset: statementSql ? Math.max(0, cursorOffset - span.start) : cursorOffset,
          span,
        };
      },
      [findStatementSpan, getSpansImmediate],
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

        const statementSql = safeSliceBySpan(sqlText, span, 'statement context');
        return {
          sql: statementSql ?? sqlText,
          cursorOffset: statementSql ? Math.max(0, cursorOffset - span.start) : cursorOffset,
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

        // Use incremental spans for immediate highlight (no waiting for full split)
        const spans = getSpansImmediate(sqlText);
        if (!spans || spans.length === 0) {
          statementDecorationsRef.current = editorRef.current.deltaDecorations(
            statementDecorationsRef.current,
            [],
          );
          return;
        }

        const statementSpan = findStatementSpan(spans, cursorOffset);
        if (!statementSpan) {
          statementDecorationsRef.current = editorRef.current.deltaDecorations(
            statementDecorationsRef.current,
            [],
          );
          return;
        }
        const startPos = model.getPositionAt(statementSpan.start);
        const endPos = model.getPositionAt(statementSpan.end);

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
      [findStatementSpan, getSpansImmediate],
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
            const startPos = model.getPositionAt(node.span.start);
            const endPos = model.getPositionAt(node.span.end);

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

          const startPos = model.getPositionAt(issue.span.start);
          const endPos = model.getPositionAt(issue.span.end);

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
            const sqlText = model.getValue();
            // Skip full analysis for large documents to avoid blocking the worker
            if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) return;
            const analysis = await getFlowScopeAnalysis(sqlText);
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
        }, FULL_SPLIT_DEBOUNCE_MS);
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
        const span = findStatementSpan(spansCache.spans, offset);
        if (!span) return null;

        return {
          start: span.start,
          end: span.end,
        };
      },
      [findStatementSpan, getSpansImmediate],
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
        terminateFlowScopeClients();
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
            cursorOffsetRef.current = offset;
            updateStatementHighlight(editorModel, offset);
          }
        }),
      );

      disposablesRef.current.push(
        editor.onDidBlurEditorText(() => {
          onBlur();
        }),
      );

      // Track old SQL for incremental span adjustment
      let previousSql = editorModel?.getValue() || '';
      // Coalesce rapid highlight updates into a single requestAnimationFrame
      let highlightRafPending = false;

      disposablesRef.current.push(
        editor.onDidChangeModelContent((event) => {
          if (editorModel) {
            const newSql = editorModel.getValue();

            // Apply incremental span adjustment
            if (event.changes.length > 0 && previousSql) {
              applyIncrementalEdit(previousSql, newSql, event.changes);
            }

            previousSql = newSql;

            // Defer highlight update to avoid recursive deltaDecorations
            // (Monaco disallows calling deltaDecorations from within onDidChangeModelContent).
            // Coalesce multiple edits into one RAF to avoid redundant layout work.
            if (!highlightRafPending) {
              highlightRafPending = true;
              requestAnimationFrame(() => {
                highlightRafPending = false;
                if (editorModel && !editorModel.isDisposed()) {
                  updateStatementHighlight(editorModel, cursorOffsetRef.current);
                }
              });
            }

            // Schedule full re-split in background (for accuracy, with long debounce)
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
          const totalStart = performance.now();
          try {
            const sqlText = completionModel.getValue();
            if (!sqlText.trim()) {
              return { suggestions: [] };
            }

            const cursorOffset = completionModel.getOffsetAt(position);
            debugLog(
              'completion: start, doc size:',
              sqlText.length,
              'chars, cursor:',
              cursorOffset,
            );

            // Try cache/incremental spans first - avoids calling split() on the worker
            // which would block completionItems() (single-threaded worker)
            const cacheStart = performance.now();
            const cachedContext = getStatementContextFromCache(sqlText, cursorOffset);
            let statementContext: StatementContext;
            if (cachedContext) {
              statementContext = cachedContext;
              debugLog(
                'completion: context from cache in',
                `${(performance.now() - cacheStart).toFixed(1)}ms`,
              );
            } else {
              // No cached spans - use fast local semicolon scan instead of
              // sending the entire document to the completion engine
              statementContext = extractStatementAroundCursor(sqlText, cursorOffset);
              debugLog(
                'completion: extracted statement via semicolon scan,',
                statementContext.sql.length,
                'chars',
              );
            }

            const triggerChar = completionContextInfo?.triggerCharacter;
            const contextTooShort = statementContext.cursorOffset > statementContext.sql.length;
            if (contextTooShort) {
              // Cursor offset is invalid, re-extract locally
              debugLog('completion: cursor offset stale, re-extracting');
              statementContext = extractStatementAroundCursor(sqlText, cursorOffset);
            }

            if (!statementContext.sql.trim()) {
              return { suggestions: [] };
            }

            debugLog(
              'completion: statement size:',
              statementContext.sql.length,
              'chars, cursorOffset:',
              statementContext.cursorOffset,
            );

            // Use dedicated completion worker to avoid being blocked by split/analyze
            const client = getCompletionClient();
            const itemsStart = performance.now();
            const result = await client.completionItems(
              statementContext.sql,
              statementContext.cursorOffset,
              schema,
            );
            debugLog(
              'completion: completionItems() took',
              `${(performance.now() - itemsStart).toFixed(1)}ms,`,
              result.items.length,
              'items',
            );

            if (!result.shouldShow) {
              debugLog(
                'completion: shouldShow=false, total time:',
                `${(performance.now() - totalStart).toFixed(1)}ms`,
              );
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

            debugLog(
              'completion: SUCCESS, total time:',
              `${(performance.now() - totalStart).toFixed(1)}ms,`,
              suggestions.length,
              'suggestions',
            );
            return { suggestions };
          } catch (error) {
            // Skip logging for cancelled requests (expected when user types quickly)
            if (!(error instanceof CancelledError)) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.warn('Completion provider failed:', message);
            } else {
              debugLog(
                'completion: CANCELLED after',
                `${(performance.now() - totalStart).toFixed(1)}ms`,
              );
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
            // Skip statement analysis for large documents to avoid blocking the worker
            if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) return null;
            const cursorOffset = hoverModel.getOffsetAt(position);
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

            // For large documents, use incremental spans to avoid queuing split
            // on the worker (which blocks completionItems)
            let spans: Span[];
            if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) {
              const immediate = getSpansImmediate(sqlText);
              if (!immediate || immediate.length === 0) return [];
              spans = immediate;
            } else {
              spans = await getStatementSpans(sqlText);
            }

            if (token.isCancellationRequested) return [];
            if (spans.length === 0) return [];

            // Resource exhaustion protection
            if (spans.length > MAX_FOLDING_SPANS) {
              console.warn(`Too many statements for folding (${spans.length}), skipping`);
              return [];
            }
            const ranges: monaco.languages.FoldingRange[] = [];
            for (const span of spans) {
              // Check cancellation inside loop for large documents
              if (token.isCancellationRequested) return ranges;

              // Skip invalid spans to prevent getPositionAt errors
              if (!isSpanValid(sqlText, span)) {
                continue;
              }

              const startPos = model.getPositionAt(span.start);
              const endPos = model.getPositionAt(span.end);

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
        provideDefinition: (model, position) =>
          withProviderErrorHandling(
            'Definition',
            async () => {
              const sqlText = model.getValue();
              const word = model.getWordAtPosition(position);
              if (!word) return null;

              const analysis = await getFlowScopeAnalysis(sqlText);
              if (!analysis) return null;

              if (!hasCteWithLabel(analysis, word.word)) return null;

              const targetLabel = word.word.toLowerCase();

              // Find the first CTE definition with this label (first occurrence is the definition)
              for (const statement of analysis.statements) {
                for (const node of statement.nodes) {
                  if (node.type === 'cte' && node.label.toLowerCase() === targetLabel) {
                    const range = spanToRange(model, node.span);
                    if (!range) {
                      console.warn(
                        `CTE '${targetLabel}' found but missing or invalid span from FlowScope`,
                      );
                      return null;
                    }

                    return { uri: model.uri, range };
                  }
                }
              }

              return null;
            },
            null,
          ),
      });

      // Find all references provider: locate all usages of a table, CTE, or view
      const referenceProvider = monacoInstance.languages.registerReferenceProvider('sql', {
        provideReferences: (model, position) =>
          withProviderErrorHandling(
            'Reference',
            async () => {
              const sqlText = model.getValue();
              const word = model.getWordAtPosition(position);
              if (!word) return [];

              const analysis = await getFlowScopeAnalysis(sqlText);
              if (!analysis) return [];

              const references: monaco.languages.Location[] = [];
              const targetLabel = word.word.toLowerCase();
              let missingSpanCount = 0;

              // Find all nodes matching the label (tables, CTEs, views)
              for (const statement of analysis.statements) {
                for (const node of statement.nodes) {
                  if (
                    (node.type === 'table' || node.type === 'cte' || node.type === 'view') &&
                    node.label.toLowerCase() === targetLabel
                  ) {
                    const range = spanToRange(model, node.span);
                    if (!range) {
                      missingSpanCount += 1;
                      continue;
                    }

                    references.push({ uri: model.uri, range });
                  }
                }
              }

              if (missingSpanCount > 0) {
                console.warn(
                  `${missingSpanCount} reference(s) for '${targetLabel}' missing or invalid span from FlowScope`,
                );
              }

              return references;
            },
            [],
          ),
      });

      // Document symbol provider: outline view and breadcrumb navigation (Ctrl+Shift+O)
      const documentSymbolProvider = monacoInstance.languages.registerDocumentSymbolProvider(
        'sql',
        {
          provideDocumentSymbols: async (model) => {
            try {
              const sqlText = model.getValue();

              // For large documents, use incremental spans to avoid queuing split
              // on the worker (which blocks completionItems)
              let spans: Span[];
              if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) {
                const immediate = getSpansImmediate(sqlText);
                if (!immediate || immediate.length === 0) return [];
                spans = immediate;
              } else {
                spans = await getStatementSpans(sqlText);
              }
              if (spans.length === 0) return [];

              const symbols: monaco.languages.DocumentSymbol[] = [];
              const seenRanges = new Set<string>();
              const statementKindMap: Record<string, monaco.languages.SymbolKind> = {
                SELECT: monacoInstance.languages.SymbolKind.Function,
                INSERT: monacoInstance.languages.SymbolKind.Method,
                UPDATE: monacoInstance.languages.SymbolKind.Method,
                DELETE: monacoInstance.languages.SymbolKind.Method,
                CREATE: monacoInstance.languages.SymbolKind.Class,
                ALTER: monacoInstance.languages.SymbolKind.Class,
                DROP: monacoInstance.languages.SymbolKind.Class,
              };

              for (let i = 0; i < spans.length; i += 1) {
                const span = spans[i];
                const range = spanToRange(model, span);
                if (!range) continue;

                const rangeKey = `${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}`;
                if (seenRanges.has(rangeKey)) {
                  continue;
                }
                seenRanges.add(rangeKey);

                const statementText = safeSliceBySpan(sqlText, span, 'document symbol') ?? '';

                // Determine statement type from first keyword
                const firstWord =
                  statementText.trim().split(/\s+/)[0]?.toUpperCase() || 'STATEMENT';
                let statementTypeLabel = firstWord;
                let statementName = `${firstWord} (${i + 1})`;
                let symbolIdentifier: string | null = null;

                if (firstWord === 'WITH') {
                  const cteMatch = statementText.match(/WITH\s+(\w+)/i);
                  if (cteMatch) {
                    const [, cteName] = cteMatch;
                    statementName = `WITH ${cteName}`;
                    symbolIdentifier = cteName;
                  }
                  const terminalMatch = statementText.match(
                    /\)\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i,
                  );
                  if (terminalMatch) {
                    const [, terminalKeyword] = terminalMatch;
                    statementTypeLabel = terminalKeyword.toUpperCase();
                  }
                } else if (firstWord === 'CREATE') {
                  const createMatch = statementText.match(
                    /CREATE\s+(?:OR\s+REPLACE\s+)?(\w+)\s+([\w.]+)/i,
                  );
                  if (createMatch) {
                    const [, createType, createTarget] = createMatch;
                    statementName = `CREATE ${createType} ${createTarget}`;
                    symbolIdentifier = createTarget;
                  }
                } else if (firstWord === 'ALTER') {
                  const alterMatch = statementText.match(/ALTER\s+(\w+)\s+([\w.]+)/i);
                  if (alterMatch) {
                    const [, alterType, alterTarget] = alterMatch;
                    statementName = `ALTER ${alterType} ${alterTarget}`;
                    symbolIdentifier = alterTarget;
                  }
                } else if (firstWord === 'DROP') {
                  const dropMatch = statementText.match(
                    /DROP\s+(?:IF\s+EXISTS\s+)?(\w+)\s+([\w.]+)/i,
                  );
                  if (dropMatch) {
                    const [, dropType, dropTarget] = dropMatch;
                    statementName = `DROP ${dropType} ${dropTarget}`;
                    symbolIdentifier = dropTarget;
                  }
                } else if (firstWord === 'INSERT') {
                  const insertMatch = statementText.match(/INSERT\s+INTO\s+([\w.]+)/i);
                  if (insertMatch) {
                    const [, insertTarget] = insertMatch;
                    statementName = `INSERT INTO ${insertTarget}`;
                    symbolIdentifier = insertTarget;
                  }
                } else if (firstWord === 'UPDATE') {
                  const updateMatch = statementText.match(/UPDATE\s+([\w.]+)/i);
                  if (updateMatch) {
                    const [, updateTarget] = updateMatch;
                    statementName = `UPDATE ${updateTarget}`;
                    symbolIdentifier = updateTarget;
                  }
                } else if (firstWord === 'DELETE') {
                  const deleteMatch = statementText.match(/DELETE\s+FROM\s+([\w.]+)/i);
                  if (deleteMatch) {
                    const [, deleteTarget] = deleteMatch;
                    statementName = `DELETE FROM ${deleteTarget}`;
                    symbolIdentifier = deleteTarget;
                  }
                } else if (firstWord === 'SELECT') {
                  // Try to find the main table in FROM clause
                  const fromMatch = statementText.match(/FROM\s+([\w.]+)/i);
                  if (fromMatch) {
                    const [, fromTarget] = fromMatch;
                    statementName = `SELECT FROM ${fromTarget}`;
                    symbolIdentifier = fromTarget;
                  }
                }

                const detailParts = [
                  symbolIdentifier,
                  firstWord === 'WITH' && statementTypeLabel !== 'WITH' ? statementTypeLabel : null,
                  `Line ${range.startLineNumber}`,
                  `Statement ${i + 1}`,
                ].filter(Boolean);

                const symbolDetail = detailParts.join(' • ');
                const symbolKind =
                  statementKindMap[statementTypeLabel] ??
                  monacoInstance.languages.SymbolKind.Function;

                symbols.push({
                  name: statementName,
                  detail: symbolDetail,
                  kind: symbolKind,
                  range,
                  selectionRange: range,
                  tags: [],
                });
              }

              return symbols;
            } catch (error) {
              if (!(error instanceof CancelledError)) {
                console.warn('Document symbol provider failed:', error);
              }
              return [];
            }
          },
        },
      );

      // Rename provider: F2 to rename CTEs across all references
      const renameProvider = monacoInstance.languages.registerRenameProvider('sql', {
        provideRenameEdits: async (model, position, newName) => {
          try {
            const sqlText = model.getValue();
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const analysis = await getFlowScopeAnalysis(sqlText);
            if (!analysis) return null;

            if (!hasCteWithLabel(analysis, word.word)) return null;

            const targetLabel = word.word.toLowerCase();
            const edits: monaco.languages.IWorkspaceTextEdit[] = [];
            let missingSpanCount = 0;

            // Find all occurrences with spans
            for (const statement of analysis.statements) {
              for (const node of statement.nodes) {
                if (
                  (node.type === 'table' || node.type === 'cte') &&
                  node.label.toLowerCase() === targetLabel
                ) {
                  const range = spanToRange(model, node.span);
                  if (!range) {
                    missingSpanCount += 1;
                    continue;
                  }

                  edits.push({
                    resource: model.uri,
                    versionId: undefined,
                    textEdit: { range, text: newName },
                  });
                }
              }
            }

            if (missingSpanCount > 0) {
              console.warn(
                `${missingSpanCount} occurrence(s) of '${targetLabel}' missing or invalid span - rename may be incomplete`,
              );
            }

            return { edits };
          } catch (error) {
            if (!(error instanceof CancelledError)) {
              console.warn('Rename provider failed:', error);
            }
            return null;
          }
        },
      });

      // Code lens provider: show reference counts above CTE definitions
      const codeLensProvider = monacoInstance.languages.registerCodeLensProvider('sql', {
        provideCodeLenses: async (model) => {
          try {
            const sqlText = model.getValue();
            // Skip full analysis for large documents to avoid blocking the worker
            if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) {
              return { lenses: [], dispose: () => {} };
            }
            const analysis = await getFlowScopeAnalysis(sqlText);
            if (!analysis) return { lenses: [], dispose: () => {} };

            const lenses: monaco.languages.CodeLens[] = [];

            // Find all CTEs and count their references, track definition spans
            const cteReferences = new Map<string, number>();
            const cteDefinitionRanges = new Map<string, monaco.IRange>();
            const ctesWithoutSpan: string[] = [];

            for (const statement of analysis.statements) {
              for (const node of statement.nodes) {
                if (node.type === 'cte') {
                  const label = node.label.toLowerCase();
                  const count = cteReferences.get(label) || 0;
                  cteReferences.set(label, count + 1);

                  // First occurrence is the definition
                  if (count === 0) {
                    const range = spanToRange(model, node.span);
                    if (range) {
                      cteDefinitionRanges.set(label, range);
                    } else {
                      ctesWithoutSpan.push(label);
                    }
                  }
                }
              }
            }

            if (ctesWithoutSpan.length > 0) {
              console.warn(
                `CTE definition(s) missing or invalid span: ${ctesWithoutSpan.join(', ')} - code lens unavailable`,
              );
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
          } catch (error) {
            if (!(error instanceof CancelledError)) {
              console.warn('Code lens provider failed:', error);
            }
            return { lenses: [], dispose: () => {} };
          }
        },
      });

      // Linked editing ranges provider: edit all occurrences of a CTE/table name simultaneously
      const linkedEditingProvider = monacoInstance.languages.registerLinkedEditingRangeProvider(
        'sql',
        {
          provideLinkedEditingRanges: async (model, position) => {
            try {
              const sqlText = model.getValue();
              // Skip full analysis for large documents to avoid blocking the worker
              if (sqlText.length > LARGE_DOCUMENT_THRESHOLD) return null;
              const word = model.getWordAtPosition(position);
              if (!word) return null;

              const analysis = await getFlowScopeAnalysis(sqlText);
              if (!analysis) return null;

              const targetLabel = word.word.toLowerCase();
              const ranges: monaco.IRange[] = [];
              let missingSpanCount = 0;

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
                    node.label.toLowerCase() === targetLabel
                  ) {
                    const range = spanToRange(model, node.span);
                    if (!range) {
                      missingSpanCount += 1;
                      continue;
                    }

                    ranges.push(range);
                  }
                }
              }

              if (missingSpanCount > 0) {
                console.warn(
                  `${missingSpanCount} occurrence(s) of '${targetLabel}' missing or invalid span - linked editing may be incomplete`,
                );
              }

              if (ranges.length < 2) return null;

              return { ranges, wordPattern: undefined };
            } catch (error) {
              if (!(error instanceof CancelledError)) {
                console.warn('Linked editing provider failed:', error);
              }
              return null;
            }
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
