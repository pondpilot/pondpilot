import {
  addCell,
  moveCellDown,
  moveCellUp,
  removeCell,
  renameNotebook,
  updateCellContent,
  updateCellType,
  updateNotebookCells,
} from '@controllers/notebook/notebook-controller';
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
import { AdditionalCompletion } from '@features/editor';
import { Button, Center, ScrollArea, Stack, Text } from '@mantine/core';
import { CellId, NotebookCell as NotebookCellModel, NotebookCellType } from '@models/notebook';
import { NotebookTab, TabId } from '@models/tab';
import { useAppStore, useTabReactiveState, useProtectedViews } from '@store/app-store';
import { IconNotebook, IconPlus } from '@tabler/icons-react';
import { memo, useCallback, useMemo, useRef, ReactNode } from 'react';

import { AddCellButton } from './components/add-cell-button';
import { NotebookCell } from './components/notebook-cell';
import { NotebookToolbar } from './components/notebook-toolbar';
import { executeCellSQL } from './hooks/use-cell-execution';
import { useNotebookConnection } from './hooks/use-notebook-connection';
import { useNotebookExecutionState } from './hooks/use-notebook-execution-state';
import { extractCellReferences, getAutoCellViewName, parseUserCellName } from './utils/cell-naming';

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

/**
 * Builds the set of available cell view names for autocomplete and dependency tracking.
 * Returns both auto-generated (__cell_N) and user-defined names.
 */
function buildAvailableCellNames(sortedCells: NotebookCellModel[]): Set<string> {
  const names = new Set<string>();
  sortedCells.forEach((cell, index) => {
    if (cell.type === 'sql') {
      names.add(getAutoCellViewName(index));
      const userName = parseUserCellName(cell.content);
      if (userName) names.add(userName);
    }
  });
  return names;
}

/**
 * Computes which cells depend on which other cells, based on cell content referencing
 * temp view names (__cell_N or user-defined names).
 * Returns a map from cellId to the set of view names it references.
 */
function computeCellDependencies(
  sortedCells: NotebookCellModel[],
  availableNames: Set<string>,
): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const cell of sortedCells) {
    if (cell.type === 'sql') {
      const refs = extractCellReferences(cell.content, availableNames);
      if (refs.length > 0) {
        deps.set(cell.id, refs);
      }
    }
  }
  return deps;
}

/**
 * Given a cell that was just (re-)executed, find downstream cells that reference it
 * (directly or transitively) and should be marked stale.
 */
function findStaleCells(
  executedCellIndex: number,
  sortedCells: NotebookCellModel[],
  dependencies: Map<string, string[]>,
): Set<string> {
  const staleCellIds = new Set<string>();
  const executedCell = sortedCells[executedCellIndex];
  if (!executedCell || executedCell.type !== 'sql') return staleCellIds;

  // Names this cell provides
  const providedNames = new Set<string>();
  providedNames.add(getAutoCellViewName(executedCellIndex));
  const userName = parseUserCellName(executedCell.content);
  if (userName) providedNames.add(userName);

  // Check all downstream cells (cells after the executed one)
  for (let i = executedCellIndex + 1; i < sortedCells.length; i += 1) {
    const cell = sortedCells[i];
    const cellDeps = dependencies.get(cell.id);
    if (!cellDeps) continue;

    // If this cell references any name provided by the executed cell, it's stale
    for (const dep of cellDeps) {
      if (providedNames.has(dep)) {
        staleCellIds.add(cell.id);
        // Also add this cell's provided names for transitive staleness
        providedNames.add(getAutoCellViewName(i));
        const cellUserName = parseUserCellName(cell.content);
        if (cellUserName) providedNames.add(cellUserName);
        break;
      }
    }
  }

  return staleCellIds;
}

export const NotebookTabView = memo(({ tabId, active }: NotebookTabViewProps) => {
  const tab = useTabReactiveState<NotebookTab>(tabId, 'notebook');
  const notebook = useAppStore((state) => state.notebooks.get(tab.notebookId));

  // Execution state for all cells
  const { getCellState, setCellState, staleCells, markCellsStale, clearStaleCells } =
    useNotebookExecutionState();

  // DuckDB pool and protected views from hooks
  const pool = useInitializedDuckDBConnectionPool();
  const protectedViews = useProtectedViews();

  // Shared notebook connection for temp view persistence across cell executions
  const { getConnection } = useNotebookConnection(pool);

  // Track whether Run All is in progress
  const runAllAbortRef = useRef<AbortController | null>(null);

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

  const availableCellNames = useMemo(() => buildAvailableCellNames(sortedCells), [sortedCells]);

  const cellDependencies = useMemo(
    () => computeCellDependencies(sortedCells, availableCellNames),
    [sortedCells, availableCellNames],
  );

  // Build additional completions for cell reference autocomplete
  const cellCompletions: AdditionalCompletion[] = useMemo(() => {
    const completions: AdditionalCompletion[] = [];
    sortedCells.forEach((cell, index) => {
      if (cell.type !== 'sql') return;
      const autoName = getAutoCellViewName(index);
      const firstLine = cell.content.split('\n')[0]?.trim() ?? '';
      const preview = firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;

      completions.push({
        label: autoName,
        detail: `Cell ${index + 1}: ${preview}`,
      });

      const userName = parseUserCellName(cell.content);
      if (userName) {
        completions.push({
          label: userName,
          detail: `Cell ${index + 1} (named): ${preview}`,
        });
      }
    });
    return completions;
  }, [sortedCells]);

  const handleRunCell = useCallback(
    async (cellId: CellId) => {
      if (!notebook) return;
      const cellIndex = sortedCells.findIndex((c) => c.id === cellId);
      const cell = sortedCells[cellIndex];
      if (!cell || cell.type !== 'sql') return;

      const startTime = Date.now();
      setCellState(cellId, {
        status: 'running',
        error: null,
        executionTime: null,
        lastQuery: null,
      });

      try {
        const sharedConnection = await getConnection();
        const { lastQuery, error } = await executeCellSQL({
          pool,
          sql: cell.content,
          protectedViews,
          abortSignal: new AbortController().signal,
          sharedConnection,
          cellIndex,
        });

        const executionTime = Date.now() - startTime;

        if (error) {
          setCellState(cellId, {
            status: 'error',
            error,
            executionTime,
            lastQuery: null,
          });
        } else {
          setCellState(cellId, {
            status: 'success',
            error: null,
            executionTime,
            lastQuery,
          });

          // Mark downstream dependent cells as stale
          const staleIds = findStaleCells(cellIndex, sortedCells, cellDependencies);
          if (staleIds.size > 0) {
            markCellsStale(staleIds);
          }
        }
      } catch (error: any) {
        const executionTime = Date.now() - startTime;
        setCellState(cellId, {
          status: 'error',
          error: error?.message || 'Unknown error',
          executionTime,
          lastQuery: null,
        });
      }
    },
    [
      notebook,
      sortedCells,
      pool,
      protectedViews,
      setCellState,
      getConnection,
      cellDependencies,
      markCellsStale,
    ],
  );

  // Run All cells sequentially using the shared notebook connection
  const handleRunAll = useCallback(async () => {
    if (!notebook) return;

    // Cancel any existing Run All
    if (runAllAbortRef.current) {
      runAllAbortRef.current.abort();
    }
    const abortController = new AbortController();
    runAllAbortRef.current = abortController;

    // Clear stale markers since we're re-running everything
    clearStaleCells();

    const sqlCellsWithIndex = sortedCells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.type === 'sql');

    try {
      // Use the shared connection for all cells so temp views persist
      const sharedConnection = await getConnection();

      for (const { cell, index } of sqlCellsWithIndex) {
        if (abortController.signal.aborted) break;

        const startTime = Date.now();
        setCellState(cell.id, {
          status: 'running',
          error: null,
          executionTime: null,
          lastQuery: null,
        });

        try {
          const { lastQuery, error } = await executeCellSQL({
            pool,
            sql: cell.content,
            protectedViews,
            abortSignal: abortController.signal,
            sharedConnection,
            cellIndex: index,
          });

          const executionTime = Date.now() - startTime;

          if (error) {
            setCellState(cell.id, {
              status: 'error',
              error,
              executionTime,
              lastQuery: null,
            });
            // Stop on first error
            break;
          }

          setCellState(cell.id, {
            status: 'success',
            error: null,
            executionTime,
            lastQuery,
          });
        } catch (error: any) {
          const executionTime = Date.now() - startTime;
          setCellState(cell.id, {
            status: 'error',
            error: error?.message || 'Unknown error',
            executionTime,
            lastQuery: null,
          });
          break;
        }
      }
    } catch (error: any) {
      console.error('Failed to acquire shared notebook connection:', error);
    }

    runAllAbortRef.current = null;
  }, [notebook, sortedCells, pool, protectedViews, setCellState, getConnection, clearStaleCells]);

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

  const handleDelete = useCallback(
    (cellId: CellId) => {
      if (!notebook) return;
      removeCell(notebook.id, cellId);
    },
    [notebook],
  );

  const handleAddCell = useCallback(
    (type: NotebookCellType, afterCellId?: CellId) => {
      if (!notebook) return;
      const newCell = addCell(notebook.id, type, afterCellId);
      setNotebookActiveCellId(tabId, newCell.id);
    },
    [notebook, tabId],
  );

  const handleAddCellAtEnd = useCallback(
    (type: NotebookCellType) => {
      if (!notebook) return;
      const lastCell = notebook.cells[notebook.cells.length - 1];
      handleAddCell(type, lastCell?.id);
    },
    [notebook, handleAddCell],
  );

  const handleFocus = useCallback(
    (cellId: CellId) => {
      setNotebookActiveCellId(tabId, cellId);
    },
    [tabId],
  );

  const handleRename = useCallback(
    (name: string) => {
      if (!notebook) return;
      renameNotebook(notebook.id, name);
    },
    [notebook],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!notebook) return;
      const { active: dragActive, over } = event;
      if (!over || dragActive.id === over.id) return;

      const oldIndex = notebook.cells.findIndex((c) => c.id === dragActive.id);
      const newIndex = notebook.cells.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedCells = arrayMove(notebook.cells, oldIndex, newIndex);
      updateNotebookCells(notebook.id, reorderedCells);

      // When cells are reordered, __cell_N numbers shift.
      // Mark all cells that have __cell_N references as stale since
      // the temp views on the shared connection still use old numbering.
      const cellsWithAutoRefs = new Set<string>();
      for (const cell of notebook.cells) {
        if (cell.type === 'sql' && /__cell_\d+/.test(cell.content)) {
          cellsWithAutoRefs.add(cell.id);
        }
      }
      if (cellsWithAutoRefs.size > 0) {
        markCellsStale(cellsWithAutoRefs);
      }
    },
    [notebook, markCellsStale],
  );

  if (!notebook) {
    return (
      <Center className="h-full">
        <Text c="dimmed">Notebook not found</Text>
      </Center>
    );
  }

  if (!active) {
    return null;
  }

  const cellIds = sortedCells.map((c) => c.id);

  return (
    <Stack className="h-full gap-0">
      <NotebookToolbar
        notebookName={notebook.name}
        onRename={handleRename}
        onAddCell={handleAddCellAtEnd}
        onRunAll={handleRunAll}
      />

      <ScrollArea className="flex-1" type="hover" scrollHideDelay={500}>
        <div className="max-w-[960px] mx-auto px-4 py-4">
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
                  {sortedCells.map((cell, index) => (
                    <div key={cell.id}>
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
                            cellState={getCellState(cell.id)}
                            isStale={staleCells.has(cell.id)}
                            cellDependencies={cellDependencies.get(cell.id) ?? null}
                            additionalCompletions={cellCompletions}
                            dragHandleProps={dragHandleProps}
                            onContentChange={handleContentChange}
                            onTypeChange={handleTypeChange}
                            onMoveUp={handleMoveUp}
                            onMoveDown={handleMoveDown}
                            onDelete={handleDelete}
                            onRun={handleRunCell}
                            onFocus={handleFocus}
                          />
                        )}
                      </SortableCellWrapper>
                      <AddCellButton
                        onAddCell={(type) => handleAddCell(type, cell.id)}
                      />
                    </div>
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>
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
