import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { useAppTheme } from '@hooks/use-app-theme';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { CellId, NotebookCell, NotebookCellOutput } from '@models/notebook';
import { IconArrowsDiff, IconLayoutDistributeHorizontal } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeMouseHandler,
  NodeTypes,
  Panel,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { CellRunMode } from './notebook-cell';
import { NotebookDependencyNode, NotebookDependencyNodeViewData } from './notebook-dependency-node';
import {
  NotebookDependencyEdgeData,
  NotebookDependencyNodeData,
  useNotebookDependencyGraph,
} from '../hooks/use-notebook-dependency-graph';
import { CellExecutionState } from '../hooks/use-notebook-execution-state';
import {
  CellDependencyMap,
  ResolvedDependencyGraph,
  findDownstreamDependencyCells,
  findUpstreamDependencyCells,
} from '../utils/dependencies';

interface NotebookDependencyGraphProps {
  sortedCells: NotebookCell[];
  dependencies: CellDependencyMap;
  resolvedDependencyGraph: ResolvedDependencyGraph;
  circularDependencyCells: Set<string>;
  staleCells: Set<string>;
  activeCellId: CellId | null;
  fullscreenCellId: CellId | null;
  isTabActive: boolean;
  getConnection: () => Promise<AsyncDuckDBPooledConnection>;
  getCellState: (cellId: string) => CellExecutionState;
  onCellOutputChange: (cellId: CellId, output: Partial<NotebookCellOutput>) => void;
  onRunCell: (cellId: CellId, mode?: CellRunMode) => void;
  onOpenCell: (cellId: CellId) => void;
  onToggleFullscreen: (cellId: CellId) => void;
}

const nodeTypes: NodeTypes = Object.freeze({
  notebookCell: NotebookDependencyNode,
});

function getStatusColor(
  status: CellExecutionState['status'],
  isDarkMode: boolean,
): string {
  switch (status) {
    case 'running':
      return isDarkMode ? '#fbbf24' : '#d97706';
    case 'success':
      return isDarkMode ? '#34d399' : '#16a34a';
    case 'error':
      return isDarkMode ? '#f87171' : '#dc2626';
    case 'idle':
    default:
      return isDarkMode ? '#94a3b8' : '#64748b';
  }
}

export const NotebookDependencyGraph = memo(({
  sortedCells,
  dependencies,
  resolvedDependencyGraph,
  circularDependencyCells,
  staleCells,
  activeCellId,
  fullscreenCellId,
  isTabActive,
  getConnection,
  getCellState,
  onCellOutputChange,
  onRunCell,
  onOpenCell,
  onToggleFullscreen,
}: NotebookDependencyGraphProps) => {
  const colorScheme = useAppTheme();
  const isDarkMode = colorScheme === 'dark';
  const [direction, setDirection] = useState<'LR' | 'TB'>('TB');
  const [selectedCellId, setSelectedCellId] = useState<CellId | null>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<NotebookDependencyNodeViewData>(
    [],
  );
  const [flowEdges, setFlowEdges] = useEdgesState<NotebookDependencyEdgeData>([]);
  const previousDirectionRef = useRef<'LR' | 'TB'>(direction);

  const sqlCells = useMemo(
    () => sortedCells.filter((cell) => cell.type === 'sql'),
    [sortedCells],
  );
  const sqlCellIds = useMemo(() => new Set(sqlCells.map((cell) => cell.id)), [sqlCells]);

  useEffect(() => {
    if (!activeCellId || !sqlCellIds.has(activeCellId)) return;
    setSelectedCellId(activeCellId);
  }, [activeCellId, sqlCellIds]);

  useEffect(() => {
    if (!selectedCellId || sqlCellIds.has(selectedCellId)) return;
    setSelectedCellId(null);
  }, [selectedCellId, sqlCellIds]);

  const { nodes: baseNodes, edges: baseEdges } = useNotebookDependencyGraph({
    sortedCells,
    dependencies,
    resolvedDependencyGraph,
    circularDependencyCells,
    staleCells,
    getCellState,
    direction,
  });

  const upstreamIds = useMemo(() => (
    selectedCellId
      ? findUpstreamDependencyCells(selectedCellId, resolvedDependencyGraph.edges)
      : new Set<string>()
  ), [selectedCellId, resolvedDependencyGraph]);

  const downstreamIds = useMemo(() => (
    selectedCellId
      ? findDownstreamDependencyCells(selectedCellId, resolvedDependencyGraph.edges)
      : new Set<string>()
  ), [selectedCellId, resolvedDependencyGraph]);

  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of upstreamIds) ids.add(id);
    for (const id of downstreamIds) ids.add(id);
    return ids;
  }, [upstreamIds, downstreamIds]);

  const nodes = useMemo((): Node<NotebookDependencyNodeViewData>[] => {
    const hasSelection = Boolean(selectedCellId);

    return baseNodes.map((node) => {
      const data = node.data as NotebookDependencyNodeData;
      const isSelected = selectedCellId === node.id;
      const isRelated = highlightedIds.has(node.id);
      const isHighlighted = hasSelection && isRelated;

      const statusColor = getStatusColor(data.cellState.status, isDarkMode);
      const accentColor = statusColor;

      return {
        ...node,
        type: 'notebookCell',
        data: {
          ...data,
          isSelected,
          isHighlighted,
          accentColor,
          isTabActive,
          getConnection,
          onOpenCell,
          onRunCell,
          onOutputChange: onCellOutputChange,
          onToggleFullscreen,
          isFullscreen: fullscreenCellId === node.id,
        },
      };
    });
  }, [
    baseNodes,
    selectedCellId,
    highlightedIds,
    isDarkMode,
    isTabActive,
    getConnection,
    onOpenCell,
    onCellOutputChange,
    onToggleFullscreen,
    onRunCell,
    fullscreenCellId,
  ]);

  const edges = useMemo((): Edge<NotebookDependencyEdgeData>[] => {
    return baseEdges.map((edge) => {
      const isInSelectionPath = highlightedIds.has(edge.source) && highlightedIds.has(edge.target);
      const isDirectlyConnected = selectedCellId === edge.source || selectedCellId === edge.target;

      return {
        ...edge,
        animated: isDirectlyConnected,
        style: {
          stroke: isInSelectionPath ? '#3b82f6' : isDarkMode ? '#64748b' : '#94a3b8',
          strokeWidth: isInSelectionPath ? 2.5 : 1.5,
          transition: 'stroke 120ms ease, stroke-width 120ms ease',
        },
        labelStyle: {
          fill: isDarkMode ? '#cbd5e1' : '#334155',
          fontSize: 10,
          fontWeight: 500,
        },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: isDarkMode ? '#0b1120' : '#f8fafc',
          opacity: 0.95,
        },
      };
    });
  }, [baseEdges, selectedCellId, highlightedIds, isDarkMode]);

  useEffect(() => {
    setFlowNodes((previousNodes) => {
      const previousById = new Map(previousNodes.map((node) => [node.id, node]));
      const preservePositions = previousDirectionRef.current === direction;

      return nodes.map((node) => {
        if (!preservePositions) return node;
        const previousNode = previousById.get(node.id);
        if (!previousNode) return node;
        return {
          ...node,
          position: previousNode.position,
        };
      });
    });
    previousDirectionRef.current = direction;
  }, [nodes, direction, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(edges);
  }, [edges, setFlowEdges]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    setSelectedCellId(node.id as CellId);
  }, []);

  const handleNodeDoubleClick = useCallback<NodeMouseHandler>((_event, node) => {
    onOpenCell(node.id as CellId);
  }, [onOpenCell]);

  if (sqlCells.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Text c="dimmed" size="sm">
          Graph view is available for SQL cells.
        </Text>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={() => setSelectedCellId(null)}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2}
        panOnScroll={false}
        selectionOnDrag={false}
        selectNodesOnDrag={false}
        nodesDraggable
        elementsSelectable={false}
        nodesConnectable={false}
      >
        <Panel position="top-left">
          <Group
            gap={6}
            className="rounded-md border px-2 py-1 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
          >
            <Tooltip
              label={
                direction === 'LR'
                  ? 'Switch to vertical layout'
                  : 'Switch to horizontal layout'
              }
            >
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => setDirection((prev) => (prev === 'LR' ? 'TB' : 'LR'))}
              >
                {direction === 'LR'
                  ? <IconLayoutDistributeHorizontal size={14} />
                  : <IconArrowsDiff size={14} />}
              </ActionIcon>
            </Tooltip>
            <Text size="xs" c="dimmed">
              {sqlCells.length} nodes, {edges.length} edges
            </Text>
          </Group>
        </Panel>

        <Controls />
        <MiniMap nodeStrokeWidth={2} zoomable pannable />
        <Background
          variant={BackgroundVariant.Dots}
          gap={14}
          size={1}
          color={isDarkMode ? '#334155' : '#e2e8f0'}
        />
      </ReactFlow>
    </div>
  );
});

NotebookDependencyGraph.displayName = 'NotebookDependencyGraph';
