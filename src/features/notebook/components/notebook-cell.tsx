import { useSortable } from '@dnd-kit/sortable';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { SqlEditor, AdditionalCompletion, SqlEditorHandle } from '@features/editor';
import { convertToFlowScopeSchema } from '@features/editor/auto-complete';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  ActionIcon,
  Group,
  Loader,
  Text,
  Tooltip,
  Textarea,
  TextInput,
  List,
  Title,
} from '@mantine/core';
import {
  CellId,
  NotebookCell as NotebookCellModel,
  NotebookCellOutput,
  NotebookId,
  normalizeNotebookCellOutput,
} from '@models/notebook';
import { useAppStore, useDuckDBFunctions } from '@store/app-store';
import {
  IconPlayerPlay,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconGripVertical,
  IconCode,
  IconMarkdown,
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconLink,
  IconChevronRight,
  IconChevronDown,
  IconPencil,
  IconX,
} from '@tabler/icons-react';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { CellResultContainer } from './cell-result-container';
import { CellExecutionState } from '../hooks/use-notebook-execution-state';
import { CellMode } from '../hooks/use-notebook-keyboard';

interface NotebookCellProps {
  cell: NotebookCellModel;
  cellIndex: number;
  notebookId: NotebookId;
  isFirst: boolean;
  isLast: boolean;
  isActive: boolean;
  isOnlyCell: boolean;
  isTabActive: boolean;
  cellState: CellExecutionState;
  isStale: boolean;
  cellDependencies: string[] | null;
  hasCircularDependency?: boolean;
  hasReferenceConflict?: boolean;
  additionalCompletions?: AdditionalCompletion[];
  dragHandleProps?: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  };
  cellMode: CellMode;
  isCollapsed: boolean;
  executionCount: number | null;
  onContentChange: (cellId: CellId, content: string) => void;
  onOutputChange: (cellId: CellId, output: Partial<NotebookCellOutput>) => void;
  onTypeChange: (cellId: CellId) => void;
  onMoveUp: (cellId: CellId) => void;
  onMoveDown: (cellId: CellId) => void;
  onDelete: (cellId: CellId) => void;
  onRenameAlias?: (cellId: CellId, nextName: string | null) => void;
  onRun?: (cellId: CellId) => void;
  onFocus: (cellId: CellId) => void;
  onEscape: () => void;
  onToggleCollapse: (cellId: CellId) => void;
  getConnection: () => Promise<AsyncDuckDBPooledConnection>;
}

export const NotebookCell = memo(
  ({
    cell,
    cellIndex,
    notebookId,
    isFirst,
    isLast,
    isActive,
    isOnlyCell,
    isTabActive,
    cellState,
    isStale,
    cellDependencies,
    hasCircularDependency = false,
    hasReferenceConflict = false,
    additionalCompletions,
    dragHandleProps,
    cellMode,
    isCollapsed,
    executionCount,
    onContentChange,
    onOutputChange,
    onTypeChange,
    onMoveUp,
    onMoveDown,
    onDelete,
    onRenameAlias,
    onRun,
    onFocus,
    onEscape,
    onToggleCollapse,
    getConnection,
  }: NotebookCellProps) => {
    const colorScheme = useAppTheme();
    const colorSchemeDark = colorScheme === 'dark';
    const [markdownEditing, setMarkdownEditing] = useState(false);
    const [aliasEditing, setAliasEditing] = useState(false);
    const [aliasValue, setAliasValue] = useState(cell.name ?? '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const sqlEditorRef = useRef<SqlEditorHandle>(null);
    const aliasInputRef = useRef<HTMLInputElement>(null);
    const cellContainerRef = useRef<HTMLDivElement>(null);

    const databaseMetadata = useAppStore.use.databaseMetadata();
    const databaseModelsArray = useMemo(
      () => Array.from(databaseMetadata.values()),
      [databaseMetadata],
    );
    const duckDBFunctions = useDuckDBFunctions();

    const schema = useMemo(
      () => convertToFlowScopeSchema(databaseModelsArray),
      [databaseModelsArray],
    );

    const functionTooltips = useMemo(() => {
      if (duckDBFunctions.length > 0) {
        return convertFunctionsToTooltips(duckDBFunctions);
      }
      return {};
    }, [duckDBFunctions]);

    const editorPath = `notebook-${notebookId}-cell-${cell.id}`;
    const sqlCellOutput = useMemo(() => normalizeNotebookCellOutput(cell.output), [cell.output]);
    const errorLineNumbers = useMemo(() => {
      if (cell.type !== 'sql' || cellState.status !== 'error' || !cellState.error) {
        return [] as number[];
      }

      const match = cellState.error.match(/\bLine\s+(\d+)\b/i);
      if (!match) return [] as number[];

      const lineNumber = Number.parseInt(match[1], 10);
      if (!Number.isFinite(lineNumber) || lineNumber <= 0) {
        return [] as number[];
      }

      return [lineNumber];
    }, [cell.type, cellState.status, cellState.error]);

    const handleContentChange = useCallback(
      (value: string) => {
        onContentChange(cell.id, value);
      },
      [cell.id, onContentChange],
    );

    const handleRun = useCallback(() => {
      onRun?.(cell.id);
    }, [cell.id, onRun]);

    const handleBlur = useCallback(() => {
      // no-op for now
    }, []);

    // Handle Escape key to enter command mode
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onEscape();
          // Blur the editor/textarea to visually exit edit mode
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      },
      [onEscape],
    );

    const handleCellClick = useCallback(() => {
      onFocus(cell.id);
    }, [cell.id, onFocus]);

    const handleHeaderClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleCollapse(cell.id);
      },
      [cell.id, onToggleCollapse],
    );

    const handleMarkdownDoubleClick = useCallback(() => {
      setMarkdownEditing(true);
    }, []);

    const handleMarkdownBlur = useCallback(() => {
      setMarkdownEditing(false);
    }, []);

    const handleAliasSubmit = useCallback(() => {
      const trimmed = aliasValue.trim();
      const nextName = trimmed.length > 0 ? trimmed : null;
      onRenameAlias?.(cell.id, nextName);
      setAliasEditing(false);
    }, [aliasValue, cell.id, onRenameAlias]);

    const handleCancelAliasEdit = useCallback(() => {
      setAliasValue(cell.name ?? '');
      setAliasEditing(false);
    }, [cell.name]);

    const handleAliasKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAliasSubmit();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelAliasEdit();
        }
      },
      [handleAliasSubmit, handleCancelAliasEdit],
    );

    // Focus textarea when entering markdown edit mode
    useEffect(() => {
      if (markdownEditing && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [markdownEditing]);

    // Ensure SQL cell editor gets focus when this cell enters edit mode.
    useEffect(() => {
      if (cell.type !== 'sql' || !isActive || cellMode !== 'edit') return;
      sqlEditorRef.current?.editor?.focus();
    }, [cell.type, isActive, cellMode]);

    useEffect(() => {
      if (!aliasEditing) {
        setAliasValue(cell.name ?? '');
      }
    }, [aliasEditing, cell.name]);

    useEffect(() => {
      if (aliasEditing && aliasInputRef.current) {
        aliasInputRef.current.focus();
        aliasInputRef.current.select();
      }
    }, [aliasEditing]);

    // Compute the number of lines for the SQL editor height
    const lineCount = cell.content.split('\n').length;
    const editorHeight = Math.max(60, Math.min(400, lineCount * 20 + 20));

    // Determine border style based on active state and cell mode
    const isCommandMode = isActive && cellMode === 'command';
    const isEditMode = isActive && cellMode === 'edit';

    // Build the execution counter label
    const execLabel = executionCount !== null ? `In [${executionCount}]` : `[${cellIndex + 1}]`;

    // First line preview for collapsed cells
    const firstLinePreview = cell.content.split('\n')[0]?.trim() || '(empty)';
    const collapsedPreview = firstLinePreview.length > 80
      ? `${firstLinePreview.slice(0, 80)}...`
      : firstLinePreview;

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        ref={cellContainerRef}
        data-testid="notebook-cell"
        data-cell-id={cell.id}
        className={cn(
          'rounded-md border-2',
          isCommandMode
            ? 'border-blue-500 dark:border-blue-400'
            : isEditMode
              ? 'border-green-500 dark:border-green-400'
              : 'border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        )}
        onClick={handleCellClick}
        onKeyDown={handleKeyDown}
      >
        {/* Cell header */}
        <Group
          gap={4}
          className={cn(
            'px-2 py-1 justify-between cursor-pointer select-none',
            'border-b border-borderPrimary-light dark:border-borderPrimary-dark',
            'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
            'rounded-t-md',
          )}
          onClick={handleHeaderClick}
        >
          <Group gap={4}>
            {/* Collapse chevron */}
            {isCollapsed ? (
              <IconChevronRight
                size={14}
                className="text-iconDefault-light dark:text-iconDefault-dark"
              />
            ) : (
              <IconChevronDown
                size={14}
                className="text-iconDefault-light dark:text-iconDefault-dark"
              />
            )}

            {/* Drag handle */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              className="cursor-grab active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              {...(dragHandleProps?.attributes ?? {})}
              {...(dragHandleProps?.listeners ?? {})}
            >
              <IconGripVertical
                size={16}
                className="text-iconDefault-light dark:text-iconDefault-dark"
              />
            </div>

            {/* Cell number/execution counter and type badge */}
            <Text size="xs" c="dimmed" className="select-none font-mono">
              {execLabel} {cell.type === 'sql' ? 'SQL' : 'Markdown'}
            </Text>

            {cell.type === 'sql' && (
              aliasEditing ? (
                <TextInput
                  ref={aliasInputRef}
                  data-testid="notebook-cell-alias-input"
                  size="xs"
                  value={aliasValue}
                  placeholder="alias"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setAliasValue(e.currentTarget.value)}
                  onBlur={handleCancelAliasEdit}
                  onKeyDown={handleAliasKeyDown}
                  className="w-[160px]"
                />
              ) : (
                <Tooltip label={`Stable ref: ${cell.ref}`} position="top">
                  <Text
                    size="xs"
                    c="dimmed"
                    className="font-mono select-none"
                    data-testid="notebook-cell-alias-value"
                  >
                    {cell.name ?? '(no alias)'}
                  </Text>
                </Tooltip>
              )
            )}

            {/* Execution status badge */}
            {cell.type === 'sql' && cellState.status === 'running' && (
              <Loader size={12} />
            )}
            {cell.type === 'sql' && cellState.status === 'success' && !isStale && (
              <IconCheck size={12} className="text-green-600 dark:text-green-400" />
            )}
            {cell.type === 'sql' && cellState.status === 'error' && (
              <IconAlertTriangle size={12} className="text-red-500 dark:text-red-400" />
            )}

            {/* Stale indicator */}
            {cell.type === 'sql' && isStale && cellState.status === 'success' && (
              <Tooltip label="Results may be stale — an upstream cell was re-executed" position="top">
                <IconClock size={12} className="text-yellow-500 dark:text-yellow-400" />
              </Tooltip>
            )}

            {/* Dependency indicator */}
            {cell.type === 'sql' && cellDependencies && cellDependencies.length > 0 && (
              <Tooltip
                label={`References: ${cellDependencies.join(', ')}`}
                position="top"
              >
                <Group gap={2}>
                  <IconLink size={12} className="text-iconDefault-light dark:text-iconDefault-dark" />
                  <Text size="xs" c="dimmed">{cellDependencies.length}</Text>
                </Group>
              </Tooltip>
            )}

            {cell.type === 'sql' && hasCircularDependency && (
              <Tooltip label="Circular dependency detected" position="top">
                <IconAlertTriangle size={12} className="text-red-500 dark:text-red-400" />
              </Tooltip>
            )}

            {cell.type === 'sql' && !hasCircularDependency && hasReferenceConflict && (
              <Tooltip label="Reference name conflict detected" position="top">
                <IconAlertTriangle size={12} className="text-orange-500 dark:text-orange-400" />
              </Tooltip>
            )}

            {/* Collapsed preview */}
            {isCollapsed && (
              <Text size="xs" c="dimmed" className="truncate max-w-[400px]">
                {collapsedPreview}
              </Text>
            )}
          </Group>

          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <Group gap={2} onClick={(e) => e.stopPropagation()}>
            {/* Run button (SQL only) */}
            {cell.type === 'sql' && (
              <Tooltip label="Run cell (Ctrl+Enter)" position="top">
                <ActionIcon
                  data-testid="notebook-cell-run"
                  size="xs"
                  variant="subtle"
                  onClick={handleRun}
                >
                  <IconPlayerPlay
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                </ActionIcon>
              </Tooltip>
            )}

            {cell.type === 'sql' && (
              aliasEditing ? (
                <>
                  <Tooltip label="Apply alias" position="top">
                    <ActionIcon
                      data-testid="notebook-cell-alias-save"
                      size="xs"
                      variant="subtle"
                      onClick={handleAliasSubmit}
                    >
                      <IconCheck
                        size={14}
                        className="text-iconDefault-light dark:text-iconDefault-dark"
                      />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Cancel alias edit" position="top">
                    <ActionIcon
                      data-testid="notebook-cell-alias-cancel"
                      size="xs"
                      variant="subtle"
                      onClick={handleCancelAliasEdit}
                    >
                      <IconX
                        size={14}
                        className="text-iconDefault-light dark:text-iconDefault-dark"
                      />
                    </ActionIcon>
                  </Tooltip>
                </>
              ) : (
                <Tooltip label="Rename cell alias" position="top">
                  <ActionIcon
                    data-testid="notebook-cell-alias-edit"
                    size="xs"
                    variant="subtle"
                    onClick={() => setAliasEditing(true)}
                  >
                    <IconPencil
                      size={14}
                      className="text-iconDefault-light dark:text-iconDefault-dark"
                    />
                  </ActionIcon>
                </Tooltip>
              )
            )}

            {/* Type toggle */}
            <Tooltip
              label={cell.type === 'sql' ? 'Convert to Markdown' : 'Convert to SQL'}
              position="top"
            >
              <ActionIcon
                data-testid="notebook-cell-type-toggle"
                size="xs"
                variant="subtle"
                onClick={() => onTypeChange(cell.id)}
              >
                {cell.type === 'sql' ? (
                  <IconMarkdown
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                ) : (
                  <IconCode
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                )}
              </ActionIcon>
            </Tooltip>

            {/* Move up */}
            <Tooltip label="Move up" position="top">
              <ActionIcon
                data-testid="notebook-cell-move-up"
                size="xs"
                variant="subtle"
                disabled={isFirst}
                onClick={() => onMoveUp(cell.id)}
              >
                <IconArrowUp
                  size={14}
                  className="text-iconDefault-light dark:text-iconDefault-dark"
                />
              </ActionIcon>
            </Tooltip>

            {/* Move down */}
            <Tooltip label="Move down" position="top">
              <ActionIcon
                data-testid="notebook-cell-move-down"
                size="xs"
                variant="subtle"
                disabled={isLast}
                onClick={() => onMoveDown(cell.id)}
              >
                <IconArrowDown
                  size={14}
                  className="text-iconDefault-light dark:text-iconDefault-dark"
                />
              </ActionIcon>
            </Tooltip>

            {/* Delete */}
            <Tooltip label="Delete cell" position="top">
              <ActionIcon
                data-testid="notebook-cell-delete"
                size="xs"
                variant="subtle"
                disabled={isOnlyCell}
                onClick={() => onDelete(cell.id)}
              >
                <IconTrash
                  size={14}
                  className="text-iconDefault-light dark:text-iconDefault-dark"
                />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Cell content - hidden when collapsed */}
        {!isCollapsed && (
          <div className="min-h-[60px]">
            {cell.type === 'sql' ? (
              <div style={{ height: editorHeight }}>
                <div data-testid="notebook-cell-sql-editor" className="h-full">
                  <SqlEditor
                    ref={sqlEditorRef}
                    colorSchemeDark={colorSchemeDark}
                    value={cell.content}
                    onChange={handleContentChange}
                    onRun={handleRun}
                    onBlur={handleBlur}
                    schema={schema}
                    functionTooltips={functionTooltips}
                    path={editorPath}
                    additionalCompletions={additionalCompletions}
                    highlightedLineNumbers={errorLineNumbers}
                  />
                </div>
              </div>
            ) : markdownEditing || cell.content.length === 0 ? (
              <Textarea
                ref={textareaRef}
                value={cell.content}
                onFocus={() => setMarkdownEditing(true)}
                onChange={(e) => handleContentChange(e.currentTarget.value)}
                onBlur={handleMarkdownBlur}
                onKeyDown={handleKeyDown}
                placeholder="Write markdown here..."
                autosize
                minRows={3}
                variant="unstyled"
                className="px-3 py-2"
                styles={{
                  input: {
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '14px',
                  },
                }}
              />
            ) : (
              <div
                className="px-3 py-2 cursor-text min-h-[60px]"
                onDoubleClick={handleMarkdownDoubleClick}
              >
                <ReactMarkdown
                  components={{
                    h1: ({ node: _node, ...props }) => (
                      <Title className="py-1" order={1} {...props} />
                    ),
                    h2: ({ node: _node, ...props }) => (
                      <Title className="py-1" order={2} {...props} />
                    ),
                    h3: ({ node: _node, ...props }) => (
                      <Title className="py-1" order={3} {...props} />
                    ),
                    h4: ({ node: _node, ...props }) => (
                      <Title className="py-1" order={4} {...props} />
                    ),
                    p: ({ node: _node, ...props }) => <Text className="py-1" {...props} />,
                    ul: ({ node: _node, ...props }) => (
                      <List
                        className="py-1 list-disc list-inside"
                        {...props}
                        c="text-primary"
                        size="sm"
                      />
                    ),
                    li: ({ node: _node, ...props }) => <List.Item {...props} />,
                    a: ({ node: _node, ...props }) => (
                      <Text
                        component="a"
                        {...props}
                        c="text-accent"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      />
                    ),
                  }}
                >
                  {cell.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Inline result view for SQL cells */}
        {cell.type === 'sql' && cellState.status !== 'idle' && (
          <CellResultContainer
            cellId={cell.id}
            cellState={cellState}
            active={isTabActive}
            getConnection={getConnection}
            cellOutput={sqlCellOutput}
            onOutputChange={(output) => onOutputChange(cell.id, output)}
          />
        )}
      </div>
    );
  },
);

NotebookCell.displayName = 'NotebookCell';
