import { useSortable } from '@dnd-kit/sortable';
import { SqlEditor } from '@features/editor';
import { convertToFlowScopeSchema } from '@features/editor/auto-complete';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  ActionIcon,
  Group,
  Loader,
  Text,
  Tooltip,
  Textarea,
  List,
  Title,
} from '@mantine/core';
import { CellId, NotebookCell as NotebookCellModel, NotebookId } from '@models/notebook';
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
} from '@tabler/icons-react';
import { convertFunctionsToTooltips } from '@utils/convert-functions-to-tooltip';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { CellResultContainer } from './cell-result-container';
import { CellExecutionState } from '../hooks/use-notebook-execution-state';

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
  dragHandleProps?: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  };
  onContentChange: (cellId: CellId, content: string) => void;
  onTypeChange: (cellId: CellId) => void;
  onMoveUp: (cellId: CellId) => void;
  onMoveDown: (cellId: CellId) => void;
  onDelete: (cellId: CellId) => void;
  onRun?: (cellId: CellId) => void;
  onFocus: (cellId: CellId) => void;
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
    dragHandleProps,
    onContentChange,
    onTypeChange,
    onMoveUp,
    onMoveDown,
    onDelete,
    onRun,
    onFocus,
  }: NotebookCellProps) => {
    const colorScheme = useAppTheme();
    const colorSchemeDark = colorScheme === 'dark';
    const [markdownEditing, setMarkdownEditing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    const handleCellClick = useCallback(() => {
      onFocus(cell.id);
    }, [cell.id, onFocus]);

    const handleMarkdownDoubleClick = useCallback(() => {
      setMarkdownEditing(true);
    }, []);

    const handleMarkdownBlur = useCallback(() => {
      setMarkdownEditing(false);
    }, []);

    // Focus textarea when entering markdown edit mode
    useEffect(() => {
      if (markdownEditing && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [markdownEditing]);

    // Compute the number of lines for the SQL editor height
    const lineCount = cell.content.split('\n').length;
    const editorHeight = Math.max(60, Math.min(400, lineCount * 20 + 20));

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        className={cn(
          'rounded-md border',
          isActive
            ? 'border-borderAccent-light dark:border-borderAccent-dark'
            : 'border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        )}
        onClick={handleCellClick}
      >
        {/* Cell header */}
        <Group
          gap={4}
          className={cn(
            'px-2 py-1 justify-between',
            'border-b border-borderPrimary-light dark:border-borderPrimary-dark',
            'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
            'rounded-t-md',
          )}
        >
          <Group gap={4}>
            {/* Drag handle */}
            <div
              className="cursor-grab active:cursor-grabbing"
              {...(dragHandleProps?.attributes ?? {})}
              {...(dragHandleProps?.listeners ?? {})}
            >
              <IconGripVertical
                size={16}
                className="text-iconDefault-light dark:text-iconDefault-dark"
              />
            </div>

            {/* Cell number and type badge */}
            <Text size="xs" c="dimmed" className="select-none">
              [{cellIndex + 1}] {cell.type === 'sql' ? 'SQL' : 'Markdown'}
            </Text>

            {/* Execution status badge */}
            {cell.type === 'sql' && cellState.status === 'running' && (
              <Loader size={12} />
            )}
            {cell.type === 'sql' && cellState.status === 'success' && (
              <IconCheck size={12} className="text-green-600 dark:text-green-400" />
            )}
            {cell.type === 'sql' && cellState.status === 'error' && (
              <IconAlertTriangle size={12} className="text-red-500 dark:text-red-400" />
            )}
          </Group>

          <Group gap={2}>
            {/* Run button (SQL only) */}
            {cell.type === 'sql' && (
              <Tooltip label="Run cell (Ctrl+Enter)" position="top">
                <ActionIcon size="xs" variant="subtle" onClick={handleRun}>
                  <IconPlayerPlay
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                </ActionIcon>
              </Tooltip>
            )}

            {/* Type toggle */}
            <Tooltip
              label={cell.type === 'sql' ? 'Convert to Markdown' : 'Convert to SQL'}
              position="top"
            >
              <ActionIcon
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

        {/* Cell content */}
        <div className="min-h-[60px]">
          {cell.type === 'sql' ? (
            <div style={{ height: editorHeight }}>
              <SqlEditor
                colorSchemeDark={colorSchemeDark}
                value={cell.content}
                onChange={handleContentChange}
                onRun={handleRun}
                onBlur={handleBlur}
                schema={schema}
                functionTooltips={functionTooltips}
                path={editorPath}
              />
            </div>
          ) : markdownEditing || cell.content.length === 0 ? (
            <Textarea
              ref={textareaRef}
              value={cell.content}
              onChange={(e) => handleContentChange(e.currentTarget.value)}
              onBlur={handleMarkdownBlur}
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

        {/* Inline result view for SQL cells */}
        {cell.type === 'sql' && cellState.status !== 'idle' && (
          <CellResultContainer
            cellId={cell.id}
            cellState={cellState}
            active={isTabActive}
          />
        )}
      </div>
    );
  },
);

NotebookCell.displayName = 'NotebookCell';
