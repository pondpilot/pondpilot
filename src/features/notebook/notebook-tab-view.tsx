import { showAlertWithAction, showWarning, showWarningWithAction } from '@components/app-notifications';
import {
  addCell,
  addCellAtStart,
  applyNotebookCellContentPatches,
  clearNotebookCellExecutions,
  moveCellDown,
  moveCellUp,
  removeCell,
  renameNotebook,
  updateCellName,
  updateCellExecution,
  updateCellOutput,
  updateCellContent,
  updateCellType,
  updateNotebookCells,
} from '@controllers/notebook/notebook-controller';
import { insertCellAfter, insertCellAtStart } from '@controllers/notebook/pure';
import { setNotebookActiveCellId } from '@controllers/tab';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  MouseSensor,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { AdditionalCompletion } from '@features/editor';
import { Button, Center, ScrollArea, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  CellId,
  NotebookCellExecution,
  NotebookCellExecutionPatch,
  NotebookCell as NotebookCellModel,
  NotebookId,
  NotebookCellOutput,
  NotebookCellType,
  normalizeNotebookCellExecution,
} from '@models/notebook';
import { NotebookTab, TabId } from '@models/tab';
import { useAppStore, useTabReactiveState, useProtectedViews } from '@store/app-store';
import { IconNotebook, IconPlus } from '@tabler/icons-react';
import { convertArrowTable, getArrowTableSchema } from '@utils/arrow';
import { ensureCellRef } from '@utils/notebook';
import { exportNotebookAsHtml, exportNotebookAsSqlnb } from '@utils/notebook-export';
import { memo, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

import { AddCellButton } from './components/add-cell-button';
import { NotebookCell, type CellRunMode } from './components/notebook-cell';
import { NotebookDependencyGraph } from './components/notebook-dependency-graph';
import { NotebookToolbar } from './components/notebook-toolbar';
import { executeCellSQL } from './hooks/use-cell-execution';
import { useNotebookConnection } from './hooks/use-notebook-connection';
import { useNotebookExecutionState } from './hooks/use-notebook-execution-state';
import { useNotebookKeyboard, CellMode } from './hooks/use-notebook-keyboard';
import { normalizeCellName } from './utils/cell-naming';
import {
  buildAvailableCellNames,
  buildResolvedDependencyGraph,
  CellDependencyMap,
  computeCellDependencies,
  computeCellDependenciesWithLineage,
  detectCircularDependencyCells,
  findDownstreamDependencyCells,
  findCellsReferencingTargetCell,
  findStaleCells,
  findUpstreamDependencyCells,
} from './utils/dependencies';
import { previewNotebookAliasRenameRefactor } from './utils/rename-refactor';

interface NotebookTabViewProps {
  tabId: TabId;
  active: boolean;
}

interface SortableCellWrapperProps {
  id: string;
  children: (dragHandleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  }) => ReactNode;
}

const SortableCellWrapper = ({ id, children }: SortableCellWrapperProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
};

type RunAllState = {
  running: boolean;
  current: number;
  total: number;
  continueOnError: boolean;
};

type NotebookViewMode = 'list' | 'graph';

const MAX_PERSISTED_SNAPSHOT_ROWS = 200;

function buildExecutionStateMap(cells: NotebookCellModel[]): {
  stateMap: Map<string, NotebookCellExecution>;
  maxExecutionCount: number;
} {
  const stateMap = new Map<string, NotebookCellExecution>();
  let maxExecutionCount = 0;

  for (const cell of cells) {
    if (cell.type !== 'sql') continue;
    const normalized = normalizeNotebookCellExecution(cell.execution);
    stateMap.set(cell.id, normalized);
    if ((normalized.executionCount ?? 0) > maxExecutionCount) {
      maxExecutionCount = normalized.executionCount ?? 0;
    }
  }

  return { stateMap, maxExecutionCount };
}

function buildTopologicalExecutionOrder(
  sqlCellsWithIndex: { cell: NotebookCellModel; index: number }[],
  dependencyEdges: Map<string, Set<string>>,
  blockedCellIds: Set<string>,
): { cell: NotebookCellModel; index: number }[] {
  const eligible = sqlCellsWithIndex.filter(({ cell }) => !blockedCellIds.has(cell.id));
  const indexByCellId = new Map<string, number>(
    eligible.map(({ cell, index }) => [cell.id, index]),
  );

  const inDegree = new Map<string, number>();
  const consumersByProvider = new Map<string, Set<string>>();

  for (const { cell } of eligible) {
    inDegree.set(cell.id, 0);
  }

  for (const { cell } of eligible) {
    const providers = dependencyEdges.get(cell.id) ?? new Set<string>();
    let count = 0;
    for (const providerId of providers) {
      if (!inDegree.has(providerId)) continue;
      count += 1;
      if (!consumersByProvider.has(providerId)) {
        consumersByProvider.set(providerId, new Set<string>());
      }
      consumersByProvider.get(providerId)?.add(cell.id);
    }
    inDegree.set(cell.id, count);
  }

  const queue = eligible
    .filter(({ cell }) => (inDegree.get(cell.id) ?? 0) === 0)
    .sort((a, b) => a.index - b.index);

  const ordered: { cell: NotebookCellModel; index: number }[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next.cell.id)) continue;
    seen.add(next.cell.id);
    ordered.push(next);

    const consumers = consumersByProvider.get(next.cell.id);
    if (!consumers) continue;

    for (const consumerId of consumers) {
      const nextInDegree = (inDegree.get(consumerId) ?? 0) - 1;
      inDegree.set(consumerId, nextInDegree);
      if (nextInDegree !== 0) continue;
      const consumerIndex = indexByCellId.get(consumerId);
      if (consumerIndex === undefined) continue;
      const consumerCell = eligible.find(({ cell }) => cell.id === consumerId)?.cell;
      if (!consumerCell) continue;
      queue.push({ cell: consumerCell, index: consumerIndex });
      queue.sort((a, b) => a.index - b.index);
    }
  }

  if (ordered.length === eligible.length) return ordered;

  const remainder = eligible
    .filter(({ cell }) => !seen.has(cell.id))
    .sort((a, b) => a.index - b.index);

  return [...ordered, ...remainder];
}

async function captureCellSnapshot(
  connection: AsyncDuckDBPooledConnection,
  lastQuery: string | null,
): Promise<NotebookCellExecution['snapshot']> {
  if (!lastQuery) return null;

  const trimmedQuery = lastQuery.trim().replace(/;+\s*$/, '');
  if (!trimmedQuery) return null;

  const snapshotQuery = `SELECT * FROM (${trimmedQuery}) AS __pondpilot_notebook_snapshot LIMIT ${MAX_PERSISTED_SNAPSHOT_ROWS + 1}`;

  try {
    const result = await connection.query(snapshotQuery);
    const schema = getArrowTableSchema(result);
    const allRows = convertArrowTable(result, schema);
    const truncated = allRows.length > MAX_PERSISTED_SNAPSHOT_ROWS;
    const rows = truncated ? allRows.slice(0, MAX_PERSISTED_SNAPSHOT_ROWS) : allRows;

    return {
      schema,
      data: rows,
      truncated,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Failed to capture notebook cell snapshot', error);
    return null;
  }
}

function getCellMaterializedViewNames(cell: NotebookCellModel): string[] {
  const names: string[] = [ensureCellRef(cell.id, cell.ref)];
  const normalizedName = normalizeCellName(cell.name);
  if (normalizedName) {
    names.push(normalizedName);
  }
  return names;
}

function escapeSqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function getExistingTempViews(
  connection: AsyncDuckDBPooledConnection,
  viewNames: Iterable<string>,
): Promise<Set<string>> {
  const normalized = [...new Set(
    [...viewNames]
      .map((viewName) => viewName.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (normalized.length === 0) return new Set();

  const inClause = normalized.map((viewName) => `'${escapeSqlStringLiteral(viewName)}'`).join(', ');
  const result = await connection.query(
    `SELECT lower(view_name) AS view_name FROM duckdb_views() WHERE lower(view_name) IN (${inClause})`,
  );
  const rows = result.toArray() as Array<Record<string, unknown>>;
  return new Set(rows
    .map((row) => String(row.view_name ?? '').toLowerCase())
    .filter(Boolean));
}

export const NotebookTabView = memo(({ tabId, active }: NotebookTabViewProps) => {
  const tab = useTabReactiveState<NotebookTab>(tabId, 'notebook');
  const notebook = useAppStore((state) => state.notebooks.get(tab.notebookId));

  // Execution state for all cells
  const {
    getCellState,
    setCellState,
    staleCells,
    markCellsStale,
    clearStaleCells,
    clearAllStates,
    replaceAllStates,
  } = useNotebookExecutionState();

  // DuckDB pool and protected views from hooks
  const pool = useInitializedDuckDBConnectionPool();
  const protectedViews = useProtectedViews();

  // Shared notebook connection for temp view persistence across cell executions
  const { getConnection } = useNotebookConnection(pool);

  // Track whether Run All is in progress
  const runAllAbortRef = useRef<AbortController | null>(null);

  const [runAllState, setRunAllState] = useState<RunAllState>({
    running: false,
    current: 0,
    total: 0,
    continueOnError: false,
  });
  const [viewMode, setViewMode] = useState<NotebookViewMode>('list');
  const [fullscreenCellId, setFullscreenCellId] = useState<CellId | null>(null);

  // Per-cell abort controllers so individual executions can be cancelled on re-run
  const cellAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const graphDependencyRequestRef = useRef(0);
  const [graphCellDependencies, setGraphCellDependencies] = useState<CellDependencyMap>(
    () => new Map(),
  );

  // Execution counter - increments each time any cell is executed
  const executionCounterRef = useRef<number>(0);
  const hydratedNotebookIdRef = useRef<string | null>(null);
  const issueSignatureRef = useRef<string>('');
  const telemetryRef = useRef({
    cycleDetections: 0,
    duplicateAliasDetections: 0,
    unresolvedReferenceDetections: 0,
    renameRefactorApplications: 0,
    parserFallbackRefactors: 0,
  });

  // Cell collapse state (cell content folding)
  const [collapsedCells, setCollapsedCells] = useState<Set<string>>(new Set());

  // Undo state for cell deletion
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDeleteRef = useRef<{
    cell: NotebookCellModel;
    afterCellId: CellId | undefined;
    notebookId: string;
  } | null>(null);

  // Cell refs for scroll-to-cell
  const cellRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Cell selection mode: 'edit' = cursor in editor, 'command' = cell selected (Jupyter-style)
  const [cellMode, setCellMode] = useState<CellMode>('edit');

  const enterCommandMode = useCallback(() => setCellMode('command'), []);
  const enterEditMode = useCallback(() => setCellMode('edit'), []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Compute sorted cells and dependency info
  const sortedCells = useMemo(() => {
    if (!notebook) return [];
    return [...notebook.cells].sort((a, b) => a.order - b.order);
  }, [notebook]);

  const cellIds = useMemo(() => sortedCells.map((c) => c.id), [sortedCells]);

  const availableCellNames = useMemo(() => buildAvailableCellNames(sortedCells), [sortedCells]);

  const cellDependencies = useMemo(
    () => computeCellDependencies(sortedCells, availableCellNames),
    [sortedCells, availableCellNames],
  );

  useEffect(() => {
    setGraphCellDependencies(cellDependencies);
  }, [cellDependencies]);

  useEffect(() => {
    if (viewMode !== 'graph') return;

    const requestId = graphDependencyRequestRef.current + 1;
    graphDependencyRequestRef.current = requestId;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      computeCellDependenciesWithLineage(sortedCells, availableCellNames)
        .then((nextDependencies) => {
          if (cancelled || graphDependencyRequestRef.current !== requestId) return;
          setGraphCellDependencies(nextDependencies);
        })
        .catch(() => {
          if (cancelled || graphDependencyRequestRef.current !== requestId) return;
          setGraphCellDependencies(cellDependencies);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [viewMode, sortedCells, availableCellNames, cellDependencies]);

  const resolvedDependencyGraph = useMemo(
    () => buildResolvedDependencyGraph(sortedCells, cellDependencies),
    [sortedCells, cellDependencies],
  );

  const circularDependencyCells = useMemo(
    () => detectCircularDependencyCells(resolvedDependencyGraph.edges),
    [resolvedDependencyGraph],
  );

  const graphResolvedDependencyGraph = useMemo(
    () => buildResolvedDependencyGraph(sortedCells, graphCellDependencies),
    [sortedCells, graphCellDependencies],
  );

  const graphCircularDependencyCells = useMemo(
    () => detectCircularDependencyCells(graphResolvedDependencyGraph.edges),
    [graphResolvedDependencyGraph],
  );
  const unresolvedReferenceCells = useMemo(
    () => new Set(resolvedDependencyGraph.unresolvedReferences.keys()),
    [resolvedDependencyGraph],
  );

  const initialExecutionState = useMemo(
    () => buildExecutionStateMap(sortedCells),
    [sortedCells],
  );

  useEffect(() => {
    if (!notebook) {
      hydratedNotebookIdRef.current = null;
      issueSignatureRef.current = '';
      telemetryRef.current = {
        cycleDetections: 0,
        duplicateAliasDetections: 0,
        unresolvedReferenceDetections: 0,
        renameRefactorApplications: 0,
        parserFallbackRefactors: 0,
      };
      return;
    }
    if (hydratedNotebookIdRef.current === notebook.id) return;

    replaceAllStates(initialExecutionState.stateMap);
    executionCounterRef.current = initialExecutionState.maxExecutionCount;
    hydratedNotebookIdRef.current = notebook.id;
  }, [notebook, initialExecutionState, replaceAllStates]);

  useEffect(() => {
    if (!notebook) return;

    const cycleCount = circularDependencyCells.size;
    const duplicateCount = resolvedDependencyGraph.duplicateNameCells.size;
    const unresolvedCount = unresolvedReferenceCells.size;
    const signature = `${notebook.id}|${cycleCount}|${duplicateCount}|${unresolvedCount}`;

    if (issueSignatureRef.current === signature) return;
    issueSignatureRef.current = signature;

    if (cycleCount > 0) telemetryRef.current.cycleDetections += 1;
    if (duplicateCount > 0) telemetryRef.current.duplicateAliasDetections += 1;
    if (unresolvedCount > 0) telemetryRef.current.unresolvedReferenceDetections += 1;

    if (cycleCount > 0 || duplicateCount > 0 || unresolvedCount > 0) {
      // eslint-disable-next-line no-console -- local telemetry for notebook dependency diagnostics
      console.debug('[NotebookTelemetry] dependency-issues', {
        notebookId: notebook.id,
        cycles: cycleCount,
        duplicateAliases: duplicateCount,
        unresolvedReferenceCells: unresolvedCount,
        counters: telemetryRef.current,
      });
    }
  }, [notebook, circularDependencyCells, resolvedDependencyGraph, unresolvedReferenceCells]);

  // Build additional completions for cell reference autocomplete
  const cellCompletions: AdditionalCompletion[] = useMemo(() => {
    const completions: AdditionalCompletion[] = [];
    sortedCells.forEach((cell, index) => {
      if (cell.type !== 'sql') return;
      const autoName = ensureCellRef(cell.id, cell.ref);
      const firstLine = cell.content.split('\n')[0]?.trim() ?? '';
      const preview = firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;

      completions.push({
        label: autoName,
        detail: `Cell ${index + 1} (ref): ${preview}`,
      });

      const userName = normalizeCellName(cell.name);
      if (userName) {
        completions.push({
          label: userName,
          detail: `Cell ${index + 1} (alias): ${preview}`,
        });
      }
    });
    return completions;
  }, [sortedCells]);

  // Scroll a cell into view smoothly
  const scrollToCell = useCallback((cellId: CellId) => {
    const el = cellRefsMap.current.get(cellId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  // Cell ref callback for scroll management
  const setCellRef = useCallback((cellId: string, el: HTMLDivElement | null) => {
    if (el) {
      cellRefsMap.current.set(cellId, el);
    } else {
      cellRefsMap.current.delete(cellId);
    }
  }, []);

  // Get cell type by ID helper for keyboard hook
  const getCellType = useCallback(
    (cellId: CellId) => {
      if (!notebook) return undefined;
      return notebook.cells.find((c) => c.id === cellId)?.type;
    },
    [notebook],
  );

  const persistCellExecution = useCallback(
    (notebookId: NotebookId, cellId: CellId, execution: NotebookCellExecutionPatch): void => {
      const currentNotebook = useAppStore.getState().notebooks.get(notebookId);
      if (!currentNotebook) return;
      updateCellExecution(notebookId, cellId, execution);
    },
    [],
  );

  const handleRunCell = useCallback(
    async (cellId: CellId, runMode: CellRunMode = 'run') => {
      if (!notebook) return;

      // Read the latest notebook state from the store to avoid executing stale
      // content. The user may have edited the cell since the last render.
      const currentNotebook = useAppStore.getState().notebooks.get(notebook.id);
      if (!currentNotebook) return;
      const currentCells = [...currentNotebook.cells].sort((a, b) => a.order - b.order);
      const cell = currentCells.find((c) => c.id === cellId);
      if (!cell || cell.type !== 'sql') return;

      const sqlCellsWithIndex = currentCells
        .map((nextCell, index) => ({ cell: nextCell, index }))
        .filter(({ cell: nextCell }) => nextCell.type === 'sql');
      const sqlCellsById = new Map(
        sqlCellsWithIndex.map(({ cell: nextCell }) => [nextCell.id, nextCell]),
      );

      const freshNames = buildAvailableCellNames(currentCells);
      const freshDeps = await computeCellDependenciesWithLineage(currentCells, freshNames);
      const freshResolvedGraph = buildResolvedDependencyGraph(currentCells, freshDeps);
      const freshCircularCells = detectCircularDependencyCells(freshResolvedGraph.edges);
      const blockedCellIds = new Set<string>([
        ...freshCircularCells,
        ...freshResolvedGraph.duplicateNameCells,
        ...freshResolvedGraph.unresolvedReferences.keys(),
      ]);
      const upstreamCellIds = findUpstreamDependencyCells(cellId, freshResolvedGraph.edges);
      const upstreamProviderCells = [...upstreamCellIds]
        .filter((upstreamCellId) => upstreamCellId !== cellId)
        .map((upstreamCellId) => sqlCellsById.get(upstreamCellId as CellId))
        .filter((nextCell): nextCell is NotebookCellModel => Boolean(nextCell));

      const buildExecutionPlan = (selectedCellIds: Set<string>) => {
        const scopedSqlCellsWithIndex = sqlCellsWithIndex.filter(({ cell: nextCell }) =>
          selectedCellIds.has(nextCell.id),
        );
        const orderedSqlCellsWithIndex = buildTopologicalExecutionOrder(
          scopedSqlCellsWithIndex,
          freshResolvedGraph.edges,
          blockedCellIds,
        );
        const orderedSqlCellIds = new Set(
          orderedSqlCellsWithIndex.map(({ cell: nextCell }) => nextCell.id),
        );
        const blockedSqlCellsWithIndex = scopedSqlCellsWithIndex.filter(
          ({ cell: nextCell }) =>
            blockedCellIds.has(nextCell.id) && !orderedSqlCellIds.has(nextCell.id),
        );
        return [...orderedSqlCellsWithIndex, ...blockedSqlCellsWithIndex];
      };

      const getBlockedCellMessage = (nextCellId: string): string | null => {
        if (freshCircularCells.has(nextCellId)) {
          return 'Circular dependency detected for this cell. Remove cyclical references before execution.';
        }
        if (freshResolvedGraph.unresolvedReferences.has(nextCellId)) {
          return `Unresolved cell references: ${(freshResolvedGraph.unresolvedReferences.get(nextCellId) ?? []).join(', ')}`;
        }
        if (freshResolvedGraph.duplicateNameCells.has(nextCellId)) {
          return 'Duplicate SQL cell names detected. Ensure each SQL cell ref/name is unique before execution.';
        }
        return null;
      };

      const getCellReferenceLabel = (nextCell: NotebookCellModel): string => {
        const userName = normalizeCellName(nextCell.name);
        if (userName) return userName;
        return ensureCellRef(nextCell.id, nextCell.ref);
      };

      let selectedCellIds: Set<string>;
      switch (runMode) {
        case 'upstream':
          selectedCellIds = new Set(upstreamCellIds);
          break;
        case 'downstream':
          selectedCellIds = findDownstreamDependencyCells(cellId, freshResolvedGraph.edges);
          break;
        case 'run':
        default:
          selectedCellIds = new Set([cellId]);
          break;
      }

      let failedCellId: string | null = null;
      let failedMessage: string | null = null;
      let abortController: AbortController | null = null;
      let abortControllerCellIds = new Set<string>();

      try {
        const sharedConnection = await getConnection();

        if (runMode === 'run') {
          const candidateViewNames = new Set<string>();
          for (const upstreamCell of upstreamProviderCells) {
            for (const viewName of getCellMaterializedViewNames(upstreamCell)) {
              candidateViewNames.add(viewName);
            }
          }

          let existingViewNames: Set<string> | null = null;
          try {
            existingViewNames = await getExistingTempViews(sharedConnection, candidateViewNames);
          } catch {
            existingViewNames = null;
          }

          const missingUpstreamCellIds = new Set<string>();
          for (const upstreamCell of upstreamProviderCells) {
            const upstreamState = getCellState(upstreamCell.id);
            const hasSuccessfulExecution = upstreamState.status === 'success';
            const requiredViewNames = getCellMaterializedViewNames(upstreamCell)
              .map((viewName) => viewName.toLowerCase());
            const hasRequiredViews = existingViewNames
              ? requiredViewNames.every((viewName) => existingViewNames.has(viewName))
              : hasSuccessfulExecution;
            if (!hasSuccessfulExecution || !hasRequiredViews) {
              missingUpstreamCellIds.add(upstreamCell.id);
            }
          }

          if (missingUpstreamCellIds.size > 0) {
            selectedCellIds = new Set([cellId, ...missingUpstreamCellIds]);
          }
        }

        abortControllerCellIds = new Set(selectedCellIds);
        for (const selectedId of abortControllerCellIds) {
          cellAbortControllersRef.current.get(selectedId)?.abort();
        }

        abortController = new AbortController();
        for (const selectedId of abortControllerCellIds) {
          cellAbortControllersRef.current.set(selectedId, abortController);
        }

        const executionPlan = buildExecutionPlan(selectedCellIds);
        for (let offset = 0; offset < executionPlan.length; offset += 1) {
          if (abortController.signal.aborted) return;

          const { cell: executionCell } = executionPlan[offset];
          const startTime = Date.now();
          const prevState = getCellState(executionCell.id);
          executionCounterRef.current += 1;
          const executionCount = executionCounterRef.current;

          const blockedMessage = getBlockedCellMessage(executionCell.id);
          if (blockedMessage) {
            const blockedState = normalizeNotebookCellExecution({
              ...prevState,
              status: 'error',
              error: blockedMessage,
              executionTime: 0,
              lastQuery: null,
              executionCount,
              lastRunAt: new Date().toISOString(),
              snapshot: null,
            });
            setCellState(executionCell.id, blockedState);
            persistCellExecution(notebook.id, executionCell.id, blockedState);
            failedCellId = executionCell.id;
            failedMessage = blockedMessage;
            break;
          }

          const runningState = normalizeNotebookCellExecution({
            ...prevState,
            status: 'running',
            error: null,
            executionTime: null,
            lastQuery: prevState.lastQuery,
            executionCount,
            snapshot: prevState.snapshot,
          });
          setCellState(executionCell.id, runningState);
          persistCellExecution(notebook.id, executionCell.id, {
            status: runningState.status,
            error: runningState.error,
            executionTime: runningState.executionTime,
            lastQuery: runningState.lastQuery,
            executionCount: runningState.executionCount,
            snapshot: runningState.snapshot,
          });

          try {
            const { lastQuery, error } = await executeCellSQL({
              pool,
              sql: executionCell.content,
              protectedViews,
              abortSignal: abortController.signal,
              sharedConnection,
              cellRef: ensureCellRef(executionCell.id, executionCell.ref),
              cellName: normalizeCellName(executionCell.name),
            });

            const executionTime = Date.now() - startTime;
            const lastRunAt = new Date().toISOString();

            if (error) {
              const errorState = normalizeNotebookCellExecution({
                ...runningState,
                status: 'error',
                error,
                executionTime,
                lastQuery: null,
                lastRunAt,
                snapshot: null,
              });
              setCellState(executionCell.id, errorState);
              persistCellExecution(notebook.id, executionCell.id, {
                status: errorState.status,
                error: errorState.error,
                executionTime: errorState.executionTime,
                lastQuery: errorState.lastQuery,
                executionCount: errorState.executionCount,
                lastRunAt: errorState.lastRunAt,
                snapshot: errorState.snapshot,
              });
              failedCellId = executionCell.id;
              failedMessage = error;
              break;
            }

            const snapshot = await captureCellSnapshot(sharedConnection, lastQuery);
            const successState = normalizeNotebookCellExecution({
              ...runningState,
              status: 'success',
              error: null,
              executionTime,
              lastQuery,
              lastRunAt,
              snapshot,
            });
            setCellState(executionCell.id, successState);
            persistCellExecution(notebook.id, executionCell.id, {
              status: successState.status,
              error: successState.error,
              executionTime: successState.executionTime,
              lastQuery: successState.lastQuery,
              executionCount: successState.executionCount,
              lastRunAt: successState.lastRunAt,
              snapshot: successState.snapshot,
            });

            const staleIds = findStaleCells(executionCell.id, currentCells, freshDeps);
            if (staleIds.size > 0) {
              markCellsStale(staleIds);
            }
          } catch (error: any) {
            if (abortController.signal.aborted) return;

            const executionTime = Date.now() - startTime;
            const lastRunAt = new Date().toISOString();
            const message = error?.message || 'Unknown error';
            const errorState = normalizeNotebookCellExecution({
              ...runningState,
              status: 'error',
              error: message,
              executionTime,
              lastQuery: null,
              lastRunAt,
              snapshot: null,
            });
            setCellState(executionCell.id, errorState);
            persistCellExecution(notebook.id, executionCell.id, {
              status: errorState.status,
              error: errorState.error,
              executionTime: errorState.executionTime,
              lastQuery: errorState.lastQuery,
              executionCount: errorState.executionCount,
              lastRunAt: errorState.lastRunAt,
              snapshot: errorState.snapshot,
            });
            failedCellId = executionCell.id;
            failedMessage = message;
            break;
          }
        }
      } catch (error: any) {
        if (abortController?.signal.aborted) return;

        const prevState = getCellState(cellId);
        executionCounterRef.current += 1;
        const executionCount = executionCounterRef.current;
        const message = error?.message || 'Failed to acquire shared notebook connection.';
        const errorState = normalizeNotebookCellExecution({
          ...prevState,
          status: 'error',
          error: message,
          executionTime: 0,
          lastQuery: null,
          executionCount,
          lastRunAt: new Date().toISOString(),
          snapshot: null,
        });
        setCellState(cellId, errorState);
        persistCellExecution(notebook.id, cellId, errorState);
        return;
      } finally {
        for (const selectedId of abortControllerCellIds) {
          if (
            abortController
            && cellAbortControllersRef.current.get(selectedId) === abortController
          ) {
            cellAbortControllersRef.current.delete(selectedId);
          }
        }
      }

      if (!failedCellId || !failedMessage) return;
      if (failedCellId === cellId) return;
      if (runMode === 'downstream') return;

      const failedCell = currentCells.find((currentCell) => currentCell.id === failedCellId);
      const failureLabel = failedCell ? getCellReferenceLabel(failedCell) : failedCellId;
      const prevState = getCellState(cellId);
      executionCounterRef.current += 1;
      const executionCount = executionCounterRef.current;
      const blockedByDependencyState = normalizeNotebookCellExecution({
        ...prevState,
        status: 'error',
        error: `Upstream dependency "${failureLabel}" failed: ${failedMessage}`,
        executionTime: 0,
        lastQuery: null,
        executionCount,
        lastRunAt: new Date().toISOString(),
        snapshot: null,
      });
      setCellState(cellId, blockedByDependencyState);
      persistCellExecution(notebook.id, cellId, blockedByDependencyState);
    },
    [
      notebook,
      pool,
      protectedViews,
      getCellState,
      setCellState,
      getConnection,
      markCellsStale,
      persistCellExecution,
    ],
  );

  // Run All cells sequentially using the shared notebook connection
  const handleRunAll = useCallback(async function runAll(options?: { continueOnError?: boolean }) {
    if (!notebook) return;

    const continueOnError = options?.continueOnError ?? false;

    // Cancel any existing Run All
    if (runAllAbortRef.current) {
      runAllAbortRef.current.abort();
    }
    const abortController = new AbortController();
    runAllAbortRef.current = abortController;

    // Clear stale markers since we're re-running notebook cells
    clearStaleCells();

    // Read fresh cell content from the store
    const currentNotebook = useAppStore.getState().notebooks.get(notebook.id);
    if (!currentNotebook) {
      setRunAllState((prev) => ({ ...prev, running: false }));
      return;
    }

    const currentCells = [...currentNotebook.cells].sort((a, b) => a.order - b.order);
    const sqlCellsWithIndex = currentCells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.type === 'sql');

    const totalSqlCells = sqlCellsWithIndex.length;
    setRunAllState({
      running: true,
      current: 0,
      total: totalSqlCells,
      continueOnError,
    });

    const runAllNames = buildAvailableCellNames(currentCells);
    const runAllDeps = await computeCellDependenciesWithLineage(currentCells, runAllNames);
    const runAllResolvedGraph = buildResolvedDependencyGraph(currentCells, runAllDeps);
    const runAllCircularCells = detectCircularDependencyCells(runAllResolvedGraph.edges);
    const blockedCellIds = new Set<string>([
      ...runAllCircularCells,
      ...runAllResolvedGraph.duplicateNameCells,
      ...runAllResolvedGraph.unresolvedReferences.keys(),
    ]);
    const orderedSqlCellsWithIndex = buildTopologicalExecutionOrder(
      sqlCellsWithIndex,
      runAllResolvedGraph.edges,
      blockedCellIds,
    );

    const orderedSqlCellIds = new Set(orderedSqlCellsWithIndex.map(({ cell }) => cell.id));
    const blockedSqlCellsWithIndex = sqlCellsWithIndex.filter(
      ({ cell }) => blockedCellIds.has(cell.id) && !orderedSqlCellIds.has(cell.id),
    );
    const executionPlan = [...orderedSqlCellsWithIndex, ...blockedSqlCellsWithIndex];

    let firstErrorMessage: string | null = null;
    let stoppedOnError = false;

    try {
      // Use the shared connection for all cells so temp views persist
      const sharedConnection = await getConnection();

      for (let offset = 0; offset < executionPlan.length; offset += 1) {
        const { cell } = executionPlan[offset];
        if (abortController.signal.aborted) {
          break;
        }

        setRunAllState((prev) => ({
          ...prev,
          running: true,
          current: Math.min(offset + 1, totalSqlCells),
          total: totalSqlCells,
          continueOnError,
        }));

        const startTime = Date.now();
        const prevCellState = getCellState(cell.id);
        executionCounterRef.current += 1;
        const executionCount = executionCounterRef.current;

        if (
          runAllCircularCells.has(cell.id) ||
          runAllResolvedGraph.duplicateNameCells.has(cell.id) ||
          runAllResolvedGraph.unresolvedReferences.has(cell.id)
        ) {
          const message = runAllCircularCells.has(cell.id)
            ? 'Circular dependency detected for this cell. Remove cyclical references before execution.'
            : runAllResolvedGraph.unresolvedReferences.has(cell.id)
              ? `Unresolved cell references: ${(runAllResolvedGraph.unresolvedReferences.get(cell.id) ?? []).join(', ')}`
              : 'Duplicate SQL cell names detected. Ensure each SQL cell ref/name is unique before execution.';

          const blockedState = normalizeNotebookCellExecution({
            ...prevCellState,
            status: 'error',
            error: message,
            executionTime: 0,
            lastQuery: null,
            executionCount,
            lastRunAt: new Date().toISOString(),
            snapshot: null,
          });

          setCellState(cell.id, blockedState);
          persistCellExecution(notebook.id, cell.id, blockedState);

          if (!firstErrorMessage) {
            firstErrorMessage = message;
          }

          if (!continueOnError) {
            stoppedOnError = true;
            break;
          }

          continue;
        }

        const runningState = normalizeNotebookCellExecution({
          ...prevCellState,
          status: 'running',
          error: null,
          executionTime: null,
          lastQuery: prevCellState.lastQuery,
          executionCount,
          snapshot: prevCellState.snapshot,
        });

        setCellState(cell.id, runningState);
        persistCellExecution(notebook.id, cell.id, {
          status: runningState.status,
          error: runningState.error,
          executionTime: runningState.executionTime,
          lastQuery: runningState.lastQuery,
          executionCount: runningState.executionCount,
          snapshot: runningState.snapshot,
        });

        try {
          const { lastQuery, error } = await executeCellSQL({
            pool,
            sql: cell.content,
            protectedViews,
            abortSignal: abortController.signal,
            sharedConnection,
            cellRef: ensureCellRef(cell.id, cell.ref),
            cellName: normalizeCellName(cell.name),
          });

          const executionTime = Date.now() - startTime;
          const lastRunAt = new Date().toISOString();

          if (error) {
            const errorState = normalizeNotebookCellExecution({
              ...runningState,
              status: 'error',
              error,
              executionTime,
              lastQuery: null,
              lastRunAt,
              snapshot: null,
            });
            setCellState(cell.id, errorState);
            persistCellExecution(notebook.id, cell.id, {
              status: errorState.status,
              error: errorState.error,
              executionTime: errorState.executionTime,
              lastQuery: errorState.lastQuery,
              executionCount: errorState.executionCount,
              lastRunAt: errorState.lastRunAt,
              snapshot: errorState.snapshot,
            });

            if (!firstErrorMessage) {
              firstErrorMessage = error;
            }

            if (!continueOnError) {
              stoppedOnError = true;
              break;
            }

            continue;
          }

          const snapshot = await captureCellSnapshot(sharedConnection, lastQuery);
          const successState = normalizeNotebookCellExecution({
            ...runningState,
            status: 'success',
            error: null,
            executionTime,
            lastQuery,
            lastRunAt,
            snapshot,
          });
          setCellState(cell.id, successState);
          persistCellExecution(notebook.id, cell.id, {
            status: successState.status,
            error: successState.error,
            executionTime: successState.executionTime,
            lastQuery: successState.lastQuery,
            executionCount: successState.executionCount,
            lastRunAt: successState.lastRunAt,
            snapshot: successState.snapshot,
          });
        } catch (error: any) {
          if (abortController.signal.aborted) {
            break;
          }

          const executionTime = Date.now() - startTime;
          const lastRunAt = new Date().toISOString();
          const message = error?.message || 'Unknown error';
          const errorState = normalizeNotebookCellExecution({
            ...runningState,
            status: 'error',
            error: message,
            executionTime,
            lastQuery: null,
            lastRunAt,
            snapshot: null,
          });
          setCellState(cell.id, errorState);
          persistCellExecution(notebook.id, cell.id, {
            status: errorState.status,
            error: errorState.error,
            executionTime: errorState.executionTime,
            lastQuery: errorState.lastQuery,
            executionCount: errorState.executionCount,
            lastRunAt: errorState.lastRunAt,
            snapshot: errorState.snapshot,
          });

          if (!firstErrorMessage) {
            firstErrorMessage = message;
          }

          if (!continueOnError) {
            stoppedOnError = true;
            break;
          }
        }
      }
    } catch (error: any) {
      const message = error?.message || 'Failed to acquire shared notebook connection.';
      if (!firstErrorMessage) {
        firstErrorMessage = message;
      }
      if (!continueOnError) {
        stoppedOnError = true;
      }
      console.error('Failed to acquire shared notebook connection:', error);
    } finally {
      if (runAllAbortRef.current === abortController) {
        runAllAbortRef.current = null;
      }
      setRunAllState((prev) => ({ ...prev, running: false }));
    }

    if (abortController.signal.aborted) {
      // If another Run All started immediately after this one,
      // skip cancellation noise for the superseded run.
      if (runAllAbortRef.current) {
        return;
      }

      showWarning({
        title: 'Run all cancelled',
        message: 'Notebook execution was cancelled before completion.',
      });
      return;
    }

    if (firstErrorMessage && continueOnError) {
      showWarning({
        title: 'Run all completed with errors',
        message: 'Some cells failed. Review inline errors and re-run failed cells as needed.',
      });
      return;
    }

    if (firstErrorMessage && stoppedOnError) {
      showWarningWithAction({
        title: 'Run all stopped on error',
          message: firstErrorMessage,
          action: {
            label: 'Continue',
            onClick: () => {
              runAll({ continueOnError: true }).catch(() => undefined);
            },
          },
        });
    }
  }, [
    notebook,
    pool,
    protectedViews,
    getCellState,
    setCellState,
    getConnection,
    clearStaleCells,
    persistCellExecution,
  ]);

  const handleContentChange = useCallback(
    (cellId: CellId, content: string) => {
      if (!notebook) return;
      updateCellContent(notebook.id, cellId, content);
    },
    [notebook],
  );

  const handleTypeChange = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      const cell = notebook.cells.find((c) => c.id === cellId);
      if (!cell) return;
      const newType: NotebookCellType = cell.type === 'sql' ? 'markdown' : 'sql';
      updateCellType(notebook.id, cellId, newType);
    },
    [notebook],
  );

  const handleMoveUp = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      moveCellUp(notebook.id, cellId);
    },
    [notebook],
  );

  const handleMoveDown = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      moveCellDown(notebook.id, cellId);
    },
    [notebook],
  );

  const deleteCellWithUndo = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      if (notebook.cells.length <= 1) return;

      const cellToDelete = sortedCells.find((c) => c.id === cellId);
      if (!cellToDelete) return;

      const cellIndex = sortedCells.indexOf(cellToDelete);
      const afterCellId = cellIndex > 0 ? sortedCells[cellIndex - 1].id : undefined;

      removeCell(notebook.id, cellId);

      // Move active cell after deletion
      if (tab.activeCellId === cellId) {
        const newActiveCellId = cellIndex > 0
          ? sortedCells[cellIndex - 1].id
          : sortedCells.length > 1 ? sortedCells[1].id : null;
        if (newActiveCellId) {
          setNotebookActiveCellId(tabId, newActiveCellId);
        }
      }

      // Clear any existing undo timer
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }

      const undoInfo = {
        cell: cellToDelete,
        afterCellId,
        notebookId: notebook.id,
      };
      undoDeleteRef.current = undoInfo;

      showAlertWithAction({
        title: 'Cell deleted',
        message: undefined,
        autoClose: 5000,
        withCloseButton: true,
        action: {
          label: 'Undo',
          onClick: () => {
            const { notebooks: currentNotebooks } = useAppStore.getState();
            const currentNotebook = currentNotebooks.get(undoInfo.notebookId as any);
            if (currentNotebook) {
              const restoredCells = undoInfo.afterCellId
                ? insertCellAfter(currentNotebook.cells, undoInfo.cell, undoInfo.afterCellId)
                : insertCellAtStart(currentNotebook.cells, undoInfo.cell);
              updateNotebookCells(undoInfo.notebookId as any, restoredCells);
            }
            if (undoDeleteRef.current === undoInfo) {
              undoDeleteRef.current = null;
            }
            if (undoTimerRef.current) {
              clearTimeout(undoTimerRef.current);
              undoTimerRef.current = null;
            }
          },
        },
      });

      // Clear undo state after timeout (matches notification autoClose duration)
      undoTimerRef.current = setTimeout(() => {
        undoDeleteRef.current = null;
        undoTimerRef.current = null;
      }, 5000);
    },
    [notebook, sortedCells, tab.activeCellId, tabId],
  );

  const handleDelete = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      if (notebook.cells.length <= 1) return;

      const referencingCellIds = findCellsReferencingTargetCell(
        cellId,
        sortedCells,
        cellDependencies,
      );

      if (referencingCellIds.length > 0) {
        showWarningWithAction({
          title: 'Cell is referenced',
          message: `${referencingCellIds.length} downstream cell${referencingCellIds.length !== 1 ? 's' : ''} reference this cell.`,
          action: {
            label: 'Delete anyway',
            onClick: () => {
              deleteCellWithUndo(cellId);
            },
          },
        });
        return;
      }

      deleteCellWithUndo(cellId);
    },
    [notebook, sortedCells, cellDependencies, deleteCellWithUndo],
  );

  const handleAddCell = useCallback(
    (type: NotebookCellType, afterCellId?: CellId) => {
      if (!notebook) return;
      const newCell = addCell(notebook.id, type, afterCellId);
      setNotebookActiveCellId(tabId, newCell.id);
      // Scroll to the new cell after a short delay to let the DOM update
      setTimeout(() => scrollToCell(newCell.id), 50);
    },
    [notebook, tabId, scrollToCell],
  );

  const handleAddCellAtStart = useCallback(
    (type: NotebookCellType) => {
      if (!notebook) return;
      const newCell = addCellAtStart(notebook.id, type);
      setNotebookActiveCellId(tabId, newCell.id);
      setTimeout(() => scrollToCell(newCell.id), 50);
    },
    [notebook, tabId, scrollToCell],
  );

  const handleAddCellAtEnd = useCallback(
    (type: NotebookCellType) => {
      if (!notebook) return;
      const lastCell = sortedCells[sortedCells.length - 1];
      handleAddCell(type, lastCell?.id);
    },
    [notebook, sortedCells, handleAddCell],
  );

  const handleFocus = useCallback(
    (cellId: CellId) => {
      setNotebookActiveCellId(tabId, cellId);
      enterEditMode();
    },
    [tabId, enterEditMode],
  );

  // Wrap onActiveCellChange to scroll into view
  const handleActiveCellChange = useCallback(
    (cellId: CellId) => {
      setNotebookActiveCellId(tabId, cellId);
      scrollToCell(cellId);
    },
    [tabId, scrollToCell],
  );

  // Convert cell type (used by keyboard shortcut M/Y)
  const handleConvertCellType = useCallback(
    (cellId: CellId, type: NotebookCellType) => {
      if (!notebook) return;
      const cell = notebook.cells.find((c) => c.id === cellId);
      if (!cell || cell.type === type) return;
      updateCellType(notebook.id, cellId, type);
    },
    [notebook],
  );

  // Clear all outputs
  const handleClearAllOutputs = useCallback(() => {
    if (!notebook) return;
    clearNotebookCellExecutions(notebook.id);
    clearAllStates();
    executionCounterRef.current = 0;
  }, [notebook, clearAllStates]);

  // Toggle cell content collapse
  const handleToggleCellCollapse = useCallback((cellId: CellId) => {
    setCollapsedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) {
        next.delete(cellId);
      } else {
        next.add(cellId);
      }
      return next;
    });
  }, []);

  // Collapse/expand all cells
  const handleCollapseAll = useCallback(() => {
    setCollapsedCells(new Set(sortedCells.map((c) => c.id)));
  }, [sortedCells]);

  const handleExpandAll = useCallback(() => {
    setCollapsedCells(new Set());
  }, []);

  const handleRename = useCallback(
    (name: string) => {
      if (!notebook) return;
      renameNotebook(notebook.id, name);
    },
    [notebook],
  );

  const handleRenameAlias = useCallback(
    async (cellId: CellId, nextName: string | null) => {
      if (!notebook) return;

      const currentNotebook = useAppStore.getState().notebooks.get(notebook.id);
      if (!currentNotebook) return;

      const currentSortedCells = [...currentNotebook.cells].sort((a, b) => a.order - b.order);
      const targetCell = currentSortedCells.find((cell) => cell.id === cellId);
      if (!targetCell || targetCell.type !== 'sql') return;

      const normalizedNextName = normalizeCellName(nextName);
      const normalizedCurrentName = normalizeCellName(targetCell.name);
      if (normalizedCurrentName === normalizedNextName) return;

      let refactorPreview: Awaited<ReturnType<typeof previewNotebookAliasRenameRefactor>>;
      try {
        refactorPreview = await previewNotebookAliasRenameRefactor(
          currentSortedCells,
          cellId,
          normalizedNextName,
        );
      } catch (error: any) {
        showWarning({
          title: 'Alias rename failed',
          message: error?.message || 'Unable to preview alias refactor.',
        });
        return;
      }

      const applyRename = () => {
        const renameResult = updateCellName(notebook.id, cellId, normalizedNextName);
        if (!renameResult.success) {
          showWarning({
            title: 'Alias rename failed',
            message: renameResult.error,
          });
          return;
        }

        const changedCells = applyNotebookCellContentPatches(
          notebook.id,
          refactorPreview.patches.map((patch) => ({
            cellId: patch.cellId,
            content: patch.newContent,
          })),
        );

        telemetryRef.current.renameRefactorApplications += 1;
        telemetryRef.current.parserFallbackRefactors += refactorPreview.parserFallbackCount;

        // eslint-disable-next-line no-console -- local telemetry for alias rename/refactor diagnostics
        console.debug('[NotebookTelemetry] alias-rename', {
          notebookId: notebook.id,
          cellId,
          from: refactorPreview.oldName,
          to: refactorPreview.nextName,
          replacementName: refactorPreview.replacementName,
          patchedCells: changedCells,
          parserFallbackCount: refactorPreview.parserFallbackCount,
          counters: telemetryRef.current,
        });
      };

      if (refactorPreview.patches.length === 0) {
        applyRename();
        return;
      }

      const replacementCount = refactorPreview.patches.reduce(
        (sum, patch) => sum + patch.replacements,
        0,
      );

      modals.openConfirmModal({
        title: 'Rename alias and update references?',
        labels: { confirm: 'Apply rename', cancel: 'Cancel' },
        children: (
          <Stack gap={4}>
            <Text size="sm">
              This will update {replacementCount} reference
              {replacementCount === 1 ? '' : 's'} across {refactorPreview.patches.length} SQL cell
              {refactorPreview.patches.length === 1 ? '' : 's'}.
            </Text>
            {refactorPreview.parserFallbackCount > 0 && (
              <Text size="xs" c="yellow">
                Parser fallback was needed for {refactorPreview.parserFallbackCount} cell
                {refactorPreview.parserFallbackCount === 1 ? '' : 's'}.
              </Text>
            )}
          </Stack>
        ),
        onConfirm: applyRename,
      });
    },
    [notebook],
  );

  const handleExportSqlnb = useCallback(() => {
    if (!notebook) return;
    exportNotebookAsSqlnb(notebook, __VERSION__);
  }, [notebook]);

  const handleExportHtml = useCallback(() => {
    if (!notebook) return;
    exportNotebookAsHtml(notebook);
  }, [notebook]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!notebook) return;
      const { active: dragActive, over } = event;
      if (!over || dragActive.id === over.id) return;

      const oldIndex = sortedCells.findIndex((c) => c.id === dragActive.id);
      const newIndex = sortedCells.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedCells = arrayMove(sortedCells, oldIndex, newIndex);
      updateNotebookCells(notebook.id, reorderedCells);

      const reorderedNames = buildAvailableCellNames(reorderedCells);
      const reorderedDeps = computeCellDependencies(reorderedCells, reorderedNames);
      const reorderedResolvedGraph = buildResolvedDependencyGraph(reorderedCells, reorderedDeps);
      const reorderedCircularCells = detectCircularDependencyCells(reorderedResolvedGraph.edges);

      if (
        reorderedCircularCells.size > 0 ||
        reorderedResolvedGraph.duplicateNameCells.size > 0 ||
        reorderedResolvedGraph.unresolvedReferences.size > 0
      ) {
        showWarning({
          title: 'Invalid references after reorder',
          message: 'Some cells now have circular dependencies, duplicate names, or unresolved references.',
        });
      }
    },
    [notebook, sortedCells],
  );

  const handleCellOutputChange = useCallback(
    (cellId: CellId, output: Partial<NotebookCellOutput>) => {
      if (!notebook) return;
      updateCellOutput(notebook.id, cellId, output);
    },
    [notebook],
  );

  // Keyboard navigation hook
  useNotebookKeyboard({
    cellIds,
    activeCellId: tab.activeCellId,
    cellMode,
    isTabActive: active,
    onActiveCellChange: handleActiveCellChange,
    onRunCell: handleRunCell,
    onAddCell: handleAddCell,
    onAddCellAtStart: handleAddCellAtStart,
    onDeleteCell: handleDelete,
    onConvertCellType: handleConvertCellType,
    onEnterEditMode: enterEditMode,
    getCellType,
  });

  const handleViewModeChange = useCallback((nextMode: NotebookViewMode) => {
    setViewMode(nextMode);
  }, []);

  const handleToggleCellFullscreen = useCallback((cellId: CellId) => {
    setFullscreenCellId((current) => {
      if (current === cellId) return null;
      return cellId;
    });
    setNotebookActiveCellId(tabId, cellId);
    enterEditMode();
  }, [tabId, enterEditMode]);

  const handleOpenGraphCell = useCallback((cellId: CellId) => {
    setNotebookActiveCellId(tabId, cellId);
    setViewMode('list');
    enterEditMode();
    setTimeout(() => {
      scrollToCell(cellId);
    }, 40);
  }, [tabId, enterEditMode, scrollToCell]);

  useEffect(() => {
    if (!fullscreenCellId) return;
    const exists = sortedCells.some((cell) => cell.id === fullscreenCellId);
    if (!exists) setFullscreenCellId(null);
  }, [fullscreenCellId, sortedCells]);

  useEffect(() => {
    if (!fullscreenCellId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setFullscreenCellId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenCellId]);

  if (!notebook) {
    return (
      <Center className="h-full">
        <Text c="dimmed">Notebook not found</Text>
      </Center>
    );
  }

  return (
    <Stack className="h-full gap-0 relative" data-testid="notebook-tab-view">
      <NotebookToolbar
        notebookName={notebook.name}
        onRename={handleRename}
        onAddCell={handleAddCellAtEnd}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onRunAll={handleRunAll}
        runAllState={runAllState}
        onExportSqlnb={handleExportSqlnb}
        onExportHtml={handleExportHtml}
        onClearAllOutputs={handleClearAllOutputs}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
      />

      {viewMode === 'graph' ? (
        <div className="flex-1 pt-14">
          <NotebookDependencyGraph
            sortedCells={sortedCells}
            dependencies={graphCellDependencies}
            resolvedDependencyGraph={graphResolvedDependencyGraph}
            circularDependencyCells={graphCircularDependencyCells}
            staleCells={staleCells}
            activeCellId={tab.activeCellId}
            fullscreenCellId={fullscreenCellId}
            isTabActive={active}
            getConnection={getConnection}
            getCellState={getCellState}
            onCellOutputChange={handleCellOutputChange}
            onRunCell={handleRunCell}
            onOpenCell={handleOpenGraphCell}
            onToggleFullscreen={handleToggleCellFullscreen}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1" type="hover" scrollHideDelay={500}>
          <div className="max-w-[1280px] mx-auto px-4 pt-14 pb-4">
            {sortedCells.length === 0 ? (
              <EmptyNotebookState onAddCell={handleAddCellAtEnd} />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={cellIds} strategy={verticalListSortingStrategy}>
                  <Stack gap={0}>
                    {sortedCells.map((cell, index) => {
                      const cellState = getCellState(cell.id);
                      return (
                        <div
                          key={cell.id}
                          ref={(el) => setCellRef(cell.id, el)}
                        >
                          <SortableCellWrapper id={cell.id}>
                            {(dragHandleProps) => (
                              <NotebookCell
                                cell={cell}
                                cellIndex={index}
                                notebookId={notebook.id}
                                isFirst={index === 0}
                                isLast={index === sortedCells.length - 1}
                                isActive={tab.activeCellId === cell.id}
                                isOnlyCell={sortedCells.length <= 1}
                                isTabActive={active}
                                cellState={cellState}
                                isStale={staleCells.has(cell.id)}
                                cellDependencies={cellDependencies.get(cell.id) ?? null}
                                hasCircularDependency={circularDependencyCells.has(cell.id)}
                                hasReferenceConflict={
                                  resolvedDependencyGraph.duplicateNameCells.has(cell.id) ||
                                  resolvedDependencyGraph.unresolvedReferences.has(cell.id)
                                }
                                additionalCompletions={cellCompletions}
                                dragHandleProps={dragHandleProps}
                                cellMode={tab.activeCellId === cell.id ? cellMode : 'edit'}
                                isCollapsed={collapsedCells.has(cell.id)}
                                executionCount={cellState.executionCount}
                                onContentChange={handleContentChange}
                                onOutputChange={handleCellOutputChange}
                                onTypeChange={handleTypeChange}
                                onMoveUp={handleMoveUp}
                                onMoveDown={handleMoveDown}
                                onDelete={handleDelete}
                                onRenameAlias={handleRenameAlias}
                                onRun={handleRunCell}
                                onFocus={handleFocus}
                                onEscape={enterCommandMode}
                                onToggleCollapse={handleToggleCellCollapse}
                                onToggleFullscreen={handleToggleCellFullscreen}
                                isFullscreen={fullscreenCellId === cell.id}
                                getConnection={getConnection}
                              />
                            )}
                          </SortableCellWrapper>
                          <AddCellButton
                            onAddCell={(type) => handleAddCell(type, cell.id)}
                          />
                        </div>
                      );
                    })}
                  </Stack>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </ScrollArea>
      )}

      {fullscreenCellId && (
        <div className="fixed inset-0 z-[300] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-[1400px] max-h-[calc(100vh-2rem)] overflow-auto">
            {sortedCells
              .filter((cell) => cell.id === fullscreenCellId)
              .map((cell) => {
                const index = sortedCells.findIndex((nextCell) => nextCell.id === cell.id);
                const cellState = getCellState(cell.id);
                return (
                  <NotebookCell
                    key={`fullscreen-${cell.id}`}
                    cell={cell}
                    cellIndex={Math.max(index, 0)}
                    notebookId={notebook.id}
                    isFirst={index <= 0}
                    isLast={index === sortedCells.length - 1}
                    isActive
                    isOnlyCell={sortedCells.length <= 1}
                    isTabActive={active}
                    cellState={cellState}
                    isStale={staleCells.has(cell.id)}
                    cellDependencies={cellDependencies.get(cell.id) ?? null}
                    hasCircularDependency={circularDependencyCells.has(cell.id)}
                    hasReferenceConflict={
                      resolvedDependencyGraph.duplicateNameCells.has(cell.id) ||
                      resolvedDependencyGraph.unresolvedReferences.has(cell.id)
                    }
                    additionalCompletions={cellCompletions}
                    cellMode="edit"
                    isCollapsed={collapsedCells.has(cell.id)}
                    executionCount={cellState.executionCount}
                    onContentChange={handleContentChange}
                    onOutputChange={handleCellOutputChange}
                    onTypeChange={handleTypeChange}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onDelete={handleDelete}
                    onRenameAlias={handleRenameAlias}
                    onRun={handleRunCell}
                    onFocus={handleFocus}
                    onEscape={() => setFullscreenCellId(null)}
                    onToggleCollapse={handleToggleCellCollapse}
                    onToggleFullscreen={handleToggleCellFullscreen}
                    isFullscreen
                    getConnection={getConnection}
                  />
                );
              })}
          </div>
        </div>
      )}
    </Stack>
  );
});

NotebookTabView.displayName = 'NotebookTabView';

interface EmptyNotebookStateProps {
  onAddCell: (type: NotebookCellType) => void;
}

const EmptyNotebookState = ({ onAddCell }: EmptyNotebookStateProps) => {
  return (
    <Center className="py-20">
      <Stack align="center" gap="md">
        <IconNotebook size={48} stroke={1.5} opacity={0.5} />
        <Text fw={500} size="lg">
          Empty notebook
        </Text>
        <Text c="dimmed" size="sm" maw={300} ta="center">
          Add your first cell to start writing SQL queries or documentation.
        </Text>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() => onAddCell('sql')}
        >
          Add SQL Cell
        </Button>
      </Stack>
    </Center>
  );
};
