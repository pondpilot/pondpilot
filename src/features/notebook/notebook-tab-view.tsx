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
import { Button, Center, ScrollArea, Stack, Text } from '@mantine/core';
import { CellId, NotebookCellType } from '@models/notebook';
import { NotebookTab, TabId } from '@models/tab';
import { useAppStore, useTabReactiveState, useProtectedViews } from '@store/app-store';
import { IconNotebook, IconPlus } from '@tabler/icons-react';
import { memo, useCallback, useRef, ReactNode } from 'react';

import { AddCellButton } from './components/add-cell-button';
import { NotebookCell } from './components/notebook-cell';
import { NotebookToolbar } from './components/notebook-toolbar';
import { executeCellSQL } from './hooks/use-cell-execution';
import { useNotebookExecutionState } from './hooks/use-notebook-execution-state';

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

export const NotebookTabView = memo(({ tabId, active }: NotebookTabViewProps) => {
  const tab = useTabReactiveState<NotebookTab>(tabId, 'notebook');
  const notebook = useAppStore((state) => state.notebooks.get(tab.notebookId));

  // Execution state for all cells
  const { getCellState, setCellState } = useNotebookExecutionState();

  // DuckDB pool and protected views from hooks
  const pool = useInitializedDuckDBConnectionPool();
  const protectedViews = useProtectedViews();

  // Track whether Run All is in progress
  const runAllAbortRef = useRef<AbortController | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleRunCell = useCallback(
    async (cellId: CellId) => {
      if (!notebook) return;
      const cell = notebook.cells.find((c) => c.id === cellId);
      if (!cell || cell.type !== 'sql') return;

      const startTime = Date.now();
      setCellState(cellId, {
        status: 'running',
        error: null,
        executionTime: null,
        lastQuery: null,
      });

      try {
        const { lastQuery, error } = await executeCellSQL(
          pool,
          cell.content,
          protectedViews,
          new AbortController().signal,
        );

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
    [notebook, pool, protectedViews, setCellState],
  );

  // Run All cells sequentially
  const handleRunAll = useCallback(async () => {
    if (!notebook) return;

    // Cancel any existing Run All
    if (runAllAbortRef.current) {
      runAllAbortRef.current.abort();
    }
    const abortController = new AbortController();
    runAllAbortRef.current = abortController;

    const sortedCells = [...notebook.cells].sort((a, b) => a.order - b.order);
    const sqlCells = sortedCells.filter((c) => c.type === 'sql');

    for (const cell of sqlCells) {
      if (abortController.signal.aborted) break;

      const startTime = Date.now();
      setCellState(cell.id, {
        status: 'running',
        error: null,
        executionTime: null,
        lastQuery: null,
      });

      try {
        const { lastQuery, error } = await executeCellSQL(
          pool,
          cell.content,
          protectedViews,
          abortController.signal,
        );

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

    runAllAbortRef.current = null;
  }, [notebook, pool, protectedViews, setCellState]);

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
    },
    [notebook],
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

  const sortedCells = [...notebook.cells].sort((a, b) => a.order - b.order);
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
