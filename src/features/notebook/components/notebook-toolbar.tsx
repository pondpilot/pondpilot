import { ActionIcon, Group, Loader, Menu, TextInput, Tooltip } from '@mantine/core';
import { NotebookCellType } from '@models/notebook';
import {
  IconAdjustments,
  IconCode,
  IconClearAll,
  IconDownload,
  IconFold,
  IconFoldDown,
  IconLayoutRows,
  IconMap,
  IconMarkdown,
  IconPlayerPlay,
  IconPlus,
  IconPencil,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useState, useRef, useEffect } from 'react';

interface NotebookToolbarProps {
  notebookName: string;
  onRename: (name: string) => void;
  onAddCell: (type: NotebookCellType) => void;
  onRunAll?: (options?: { continueOnError?: boolean }) => void;
  onEditParameters?: () => void;
  parameterCount?: number;
  onExportSqlnb?: () => void;
  onExportHtml?: () => void;
  onClearAllOutputs?: () => void;
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
  viewMode?: 'list' | 'graph';
  onViewModeChange?: (mode: 'list' | 'graph') => void;
  runAllState?: {
    running: boolean;
    current: number;
    total: number;
    continueOnError: boolean;
  };
}

export const NotebookToolbar = memo((props: NotebookToolbarProps) => {
  const {
    notebookName,
    onRename,
    onAddCell,
    onRunAll,
    onEditParameters,
    parameterCount,
    onExportSqlnb,
    onExportHtml,
    onClearAllOutputs,
    onCollapseAll,
    onExpandAll,
    viewMode,
    onViewModeChange,
    runAllState,
  } = props;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(notebookName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(notebookName);
  }, [notebookName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== notebookName) {
      onRename(trimmed);
    } else {
      setEditValue(notebookName);
    }
    setEditing(false);
  }, [editValue, notebookName, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameSubmit();
      } else if (e.key === 'Escape') {
        setEditValue(notebookName);
        setEditing(false);
      }
    },
    [handleNameSubmit, notebookName],
  );

  return (
    <div className="absolute top-3 right-4 z-20 pointer-events-none">
      <Group
        gap={4}
        wrap="nowrap"
        className={cn(
          'pointer-events-auto h-10 px-2 rounded-xl',
          'border border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
          'shadow-sm',
        )}
      >
        {editing ? (
          <TextInput
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.currentTarget.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            size="xs"
            className="w-[180px]"
            styles={{
              input: {
                fontWeight: 600,
                fontSize: '13px',
              },
            }}
          />
        ) : (
          <Tooltip label="Rename notebook" position="top">
            <ActionIcon
              data-testid="notebook-rename-button"
              size="sm"
              variant="subtle"
              className="text-iconDefault-light dark:text-iconDefault-dark"
              onClick={() => setEditing(true)}
            >
              <IconPencil size={15} />
            </ActionIcon>
          </Tooltip>
        )}

        {/* Run All button */}
        {onRunAll && (
          <Group gap={4}>
            <Tooltip
              label={
                runAllState?.running
                  ? `Running ${runAllState.current}/${runAllState.total} SQL cells`
                  : 'Run all SQL cells'
              }
              position="top"
            >
              <ActionIcon
                data-testid="notebook-run-all-button"
                size="sm"
                variant="subtle"
                className="text-iconDefault-light dark:text-iconDefault-dark"
                onClick={() => onRunAll()}
                disabled={runAllState?.running}
              >
                {runAllState?.running ? <Loader size={14} /> : <IconPlayerPlay size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        )}

        {onEditParameters && (
          <Tooltip
            label={`Notebook parameters${parameterCount ? ` (${parameterCount})` : ''}`}
            position="top"
          >
            <ActionIcon
              data-testid="notebook-parameters-button"
              size="sm"
              variant="subtle"
              className="text-iconDefault-light dark:text-iconDefault-dark"
              onClick={onEditParameters}
            >
              <IconAdjustments size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        {onViewModeChange && (
          <Group gap={2}>
            <Tooltip label="List view" position="top">
              <ActionIcon
                data-testid="notebook-list-view-button"
                size="sm"
                variant={viewMode === 'list' ? 'light' : 'subtle'}
                className="text-iconDefault-light dark:text-iconDefault-dark"
                onClick={() => onViewModeChange('list')}
              >
                <IconLayoutRows size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Dependency graph view" position="top">
              <ActionIcon
                data-testid="notebook-graph-view-button"
                size="sm"
                variant={viewMode === 'graph' ? 'light' : 'subtle'}
                className="text-iconDefault-light dark:text-iconDefault-dark"
                onClick={() => onViewModeChange('graph')}
              >
                <IconMap size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}

        {/* Clear All Outputs */}
        {onClearAllOutputs && (
          <Tooltip label="Clear all outputs" position="top">
            <ActionIcon
              data-testid="notebook-clear-all-outputs-button"
              size="sm"
              variant="subtle"
              className="text-iconDefault-light dark:text-iconDefault-dark"
              onClick={onClearAllOutputs}
            >
              <IconClearAll size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        {/* Collapse All */}
        {onCollapseAll && (
          <Tooltip label="Collapse all cells" position="top">
            <ActionIcon
              data-testid="notebook-collapse-all-button"
              size="sm"
              variant="subtle"
              className="text-iconDefault-light dark:text-iconDefault-dark"
              onClick={onCollapseAll}
            >
              <IconFold size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        {/* Expand All */}
        {onExpandAll && (
          <Tooltip label="Expand all cells" position="top">
            <ActionIcon
              data-testid="notebook-expand-all-button"
              size="sm"
              variant="subtle"
              className="text-iconDefault-light dark:text-iconDefault-dark"
              onClick={onExpandAll}
            >
              <IconFoldDown size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        {/* Add Cell dropdown */}
        <Menu width={160} shadow="md" position="bottom-end">
          <Menu.Target>
            <Tooltip label="Add cell" position="top">
              <ActionIcon
                data-testid="notebook-add-cell-menu-button"
                size="sm"
                variant="subtle"
                className="text-iconDefault-light dark:text-iconDefault-dark"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              data-testid="notebook-add-sql-cell-menu-item"
              leftSection={<IconCode size={14} />}
              onClick={() => onAddCell('sql')}
            >
              SQL Cell
            </Menu.Item>
            <Menu.Item
              data-testid="notebook-add-markdown-cell-menu-item"
              leftSection={<IconMarkdown size={14} />}
              onClick={() => onAddCell('markdown')}
            >
              Markdown Cell
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Export dropdown */}
        <Menu width={160} shadow="md" position="bottom-end">
          <Menu.Target>
            <Tooltip label="Export" position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                className="text-iconDefault-light dark:text-iconDefault-dark"
              >
                <IconDownload size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onExportSqlnb}>Export as .sqlnb</Menu.Item>
            <Menu.Item onClick={onExportHtml}>Export as HTML</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </div>
  );
});

NotebookToolbar.displayName = 'NotebookToolbar';
