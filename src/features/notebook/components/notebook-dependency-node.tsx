import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { ActionIcon, Group, Loader, Text, Tooltip } from '@mantine/core';
import { CellId, NotebookCellOutput } from '@models/notebook';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconArrowsDiff,
  IconArrowsMaximize,
  IconCheck,
  IconClock,
  IconLink,
  IconMap,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';

import { CellResultContainer } from './cell-result-container';
import type { CellRunMode } from './notebook-cell';
import { NotebookDependencyNodeData } from '../hooks/use-notebook-dependency-graph';

export type NotebookDependencyNodeViewData = NotebookDependencyNodeData & {
  isSelected: boolean;
  isHighlighted: boolean;
  accentColor: string;
  isTabActive: boolean;
  getConnection: () => Promise<AsyncDuckDBPooledConnection>;
  onOpenCell: (cellId: CellId) => void;
  onRunCell: (cellId: CellId, mode?: CellRunMode) => void;
  onOutputChange: (cellId: CellId, output: Partial<NotebookCellOutput>) => void;
  onToggleFullscreen: (cellId: CellId) => void;
  isFullscreen: boolean;
};

function getExecutionBadge(data: NotebookDependencyNodeViewData) {
  if (data.cellState.status === 'running') {
    return <Loader size={11} />;
  }
  if (data.cellState.status === 'success') {
    return <IconCheck size={12} className="text-green-600 dark:text-green-400" />;
  }
  if (data.cellState.status === 'error') {
    return <IconAlertTriangle size={12} className="text-red-600 dark:text-red-400" />;
  }
  return <div className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />;
}

const NotebookDependencyNodeComponent = ({
  data,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<NotebookDependencyNodeViewData>) => {
  const executionLabel =
    data.cellState.executionCount !== null
      ? `In [${data.cellState.executionCount}]`
      : `[${data.index + 1}]`;
  const hasWarning = data.hasCircularDependency || data.hasReferenceConflict;
  const hasPathHighlight = data.isSelected || data.isHighlighted;
  const borderColor = hasWarning
    ? data.hasCircularDependency
      ? '#ef4444'
      : '#f59e0b'
    : hasPathHighlight
      ? '#3b82f6'
      : data.accentColor;

  return (
    <div
      className={cn(
        'rounded-md border-2 shadow-sm overflow-hidden transition-all duration-150',
        'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
      )}
      style={{
        width: 460,
        borderColor,
        boxShadow: hasPathHighlight ? '0 0 0 3px #93c5fd66' : undefined,
      }}
      data-testid={`notebook-graph-cell-node-${data.cellId}`}
    >
      <Handle
        type="target"
        position={targetPosition}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500"
      />
      <Handle
        type="source"
        position={sourcePosition}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500"
      />

      <div
        className={cn(
          'px-2 py-1 border-b',
          'border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
        )}
      >
        <Group justify="space-between" gap={4} wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Text size="10px" c="dimmed" className="font-mono">
              {executionLabel}
            </Text>
            <Text size="10px" c="dimmed" className="font-mono">
              SQL
            </Text>
            <Text size="sm" fw={600} className="truncate max-w-[220px]">
              {data.displayName}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            {getExecutionBadge(data)}
            {data.isStale && (
              <Tooltip label="Stale">
                <IconClock size={12} className="text-yellow-500 dark:text-yellow-400" />
              </Tooltip>
            )}
            {hasWarning && (
              <Tooltip
                label={data.hasCircularDependency ? 'Circular dependency' : 'Reference conflict'}
              >
                <IconAlertTriangle
                  size={12}
                  className={
                    data.hasCircularDependency
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-orange-500 dark:text-orange-400'
                  }
                />
              </Tooltip>
            )}
          </Group>
        </Group>
        <Text size="10px" c="dimmed" className="font-mono truncate">
          {data.refName}
        </Text>
      </div>

      <div className="px-2 py-1 min-h-[72px]">
        {data.contentPreviewLines.map((line, index) => (
          <Text
            // eslint-disable-next-line react/no-array-index-key -- preview-only stable in practice
            key={`${data.cellId}-${index}`}
            size="10px"
            className="font-mono leading-4 truncate"
            c="dimmed"
          >
            {line}
          </Text>
        ))}
        {data.cellState.status === 'error' && data.cellState.error && (
          <Text size="10px" c="red" className="truncate mt-1">
            {data.cellState.error}
          </Text>
        )}
      </div>

      {data.cellState.status !== 'idle' && (
        <div className="max-h-[240px] overflow-auto">
          <CellResultContainer
            cellId={data.cellId}
            cellState={data.cellState}
            active={data.isTabActive}
            getConnection={data.getConnection}
            cellOutput={data.cellOutput}
            onOutputChange={(output) => data.onOutputChange(data.cellId, output)}
            defaultCollapsed={!data.isSelected}
          />
        </div>
      )}

      <div
        className={cn(
          'px-2 py-1 border-t flex items-center justify-between',
          'border-borderPrimary-light dark:border-borderPrimary-dark',
        )}
      >
        <Group gap={4} wrap="nowrap">
          <IconLink size={12} className="text-iconDefault-light dark:text-iconDefault-dark" />
          <Text size="10px" c="dimmed">
            {data.dependencyCount}
          </Text>
          {data.unresolvedReferenceCount > 0 && (
            <Text size="10px" c="yellow">
              unresolved {data.unresolvedReferenceCount}
            </Text>
          )}
        </Group>

        <Group gap={2} wrap="nowrap">
          <Tooltip label="Open cell">
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenCell(data.cellId);
              }}
            >
              <IconMap size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={data.isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}>
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleFullscreen(data.cellId);
              }}
            >
              {data.isFullscreen ? <IconX size={12} /> : <IconArrowsMaximize size={12} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Run">
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                data.onRunCell(data.cellId, 'run');
              }}
            >
              <IconPlayerPlay size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Run upstream">
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                data.onRunCell(data.cellId, 'upstream');
              }}
            >
              <IconArrowUp size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Run downstream">
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                data.onRunCell(data.cellId, 'downstream');
              }}
            >
              <IconArrowsDiff size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
    </div>
  );
};

export const NotebookDependencyNode = memo(NotebookDependencyNodeComponent);
NotebookDependencyNode.displayName = 'NotebookDependencyNode';
