import {
  CellId,
  NotebookCell,
  NotebookCellOutput,
  normalizeNotebookCellOutput,
} from '@models/notebook';
import { ensureCellRef } from '@utils/notebook';
import dagre from 'dagre';
import { useMemo } from 'react';
import { Edge, MarkerType, Node, Position } from 'reactflow';

import { CellExecutionState } from './use-notebook-execution-state';
import { normalizeCellName } from '../utils/cell-naming';
import { CellDependencyMap, ResolvedDependencyGraph } from '../utils/dependencies';

export type NotebookDependencyNodeData = {
  cellId: CellId;
  index: number;
  alias: string | null;
  refName: string;
  displayName: string;
  contentPreviewLines: string[];
  dependencyCount: number;
  cellState: CellExecutionState;
  cellOutput: NotebookCellOutput;
  isStale: boolean;
  hasCircularDependency: boolean;
  hasReferenceConflict: boolean;
  unresolvedReferenceCount: number;
};

export type NotebookDependencyEdgeData = {
  references: string[];
};

interface UseNotebookDependencyGraphOptions {
  sortedCells: NotebookCell[];
  dependencies: CellDependencyMap;
  resolvedDependencyGraph: ResolvedDependencyGraph;
  circularDependencyCells: Set<string>;
  staleCells: Set<string>;
  getCellState: (cellId: string) => CellExecutionState;
  direction?: 'LR' | 'TB';
}

const NODE_WIDTH = 460;
const NODE_HEIGHT = 320;
const DAGRE_LAYOUT_CONFIG = {
  LR: {
    nodesep: 90,
    ranksep: 180,
    edgesep: 70,
  },
  TB: {
    nodesep: 160,
    ranksep: 180,
    edgesep: 90,
  },
} as const;

function toPreviewLine(line: string): string {
  const compact = line.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= 70) return compact;
  return `${compact.slice(0, 70)}...`;
}

function buildContentPreview(content: string): string[] {
  const lines = content
    .split('\n')
    .map((line) => toPreviewLine(line))
    .filter(Boolean)
    .slice(0, 4);
  if (lines.length > 0) return lines;
  return ['(empty)'];
}

function getProvidedNames(cell: NotebookCell): string[] {
  const names: string[] = [ensureCellRef(cell.id, cell.ref)];
  const alias = normalizeCellName(cell.name);
  if (alias) names.push(alias);
  return names;
}

function getEdgeReferences(providerCell: NotebookCell, consumerRefs: string[]): string[] {
  if (consumerRefs.length === 0) return [];

  const providerNames = new Set(getProvidedNames(providerCell).map((name) => name.toLowerCase()));
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const ref of consumerRefs) {
    const normalized = ref.toLowerCase();
    if (!providerNames.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    labels.push(ref);
  }

  return labels;
}

function layoutGraph(
  nodes: Node<NotebookDependencyNodeData>[],
  edges: Edge<NotebookDependencyEdgeData>[],
  direction: 'LR' | 'TB',
): Node<NotebookDependencyNodeData>[] {
  if (nodes.length === 0) return nodes;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  const layoutConfig = DAGRE_LAYOUT_CONFIG[direction];
  dagreGraph.setGraph({
    rankdir: direction,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
    nodesep: layoutConfig.nodesep,
    ranksep: layoutConfig.ranksep,
    edgesep: layoutConfig.edgesep,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  for (const edge of edges) {
    const sourceOrder = nodeOrder.get(edge.source) ?? 0;
    const targetOrder = nodeOrder.get(edge.target) ?? sourceOrder;
    const distance = Math.abs(targetOrder - sourceOrder);

    dagreGraph.setEdge(edge.source, edge.target, {
      // Keep near cells closer together while still respecting dependency ranks.
      weight: Math.max(1, 24 - Math.min(distance, 22)),
      minlen: 1,
    });
  }

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const position = dagreGraph.node(node.id);
    if (!position) return node;

    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    };
  });
}

export function useNotebookDependencyGraph({
  sortedCells,
  dependencies,
  resolvedDependencyGraph,
  circularDependencyCells,
  staleCells,
  getCellState,
  direction = 'TB',
}: UseNotebookDependencyGraphOptions): {
  nodes: Node<NotebookDependencyNodeData>[];
  edges: Edge<NotebookDependencyEdgeData>[];
} {
  return useMemo(() => {
    const sqlCells = sortedCells.filter((cell) => cell.type === 'sql');
    const cellById = new Map(sqlCells.map((cell) => [cell.id, cell]));

    const nodes: Node<NotebookDependencyNodeData>[] = sqlCells.map((cell, index) => {
      const alias = normalizeCellName(cell.name);
      const refName = ensureCellRef(cell.id, cell.ref);
      const state = getCellState(cell.id);
      return {
        id: cell.id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          cellId: cell.id,
          index,
          alias: alias ?? null,
          refName,
          displayName: alias ?? refName,
          contentPreviewLines: buildContentPreview(cell.content),
          dependencyCount: dependencies.get(cell.id)?.length ?? 0,
          cellState: state,
          cellOutput: normalizeNotebookCellOutput(cell.output),
          isStale: staleCells.has(cell.id),
          hasCircularDependency: circularDependencyCells.has(cell.id),
          hasReferenceConflict:
            resolvedDependencyGraph.duplicateNameCells.has(cell.id) ||
            resolvedDependencyGraph.unresolvedReferences.has(cell.id),
          unresolvedReferenceCount:
            resolvedDependencyGraph.unresolvedReferences.get(cell.id)?.length ?? 0,
        },
      };
    });

    const edges: Edge<NotebookDependencyEdgeData>[] = [];
    for (const [consumerId, providerIds] of resolvedDependencyGraph.edges.entries()) {
      const consumer = cellById.get(consumerId as CellId);
      if (!consumer) continue;
      const consumerRefs = dependencies.get(consumerId) ?? [];

      for (const providerId of providerIds) {
        const provider = cellById.get(providerId as CellId);
        if (!provider) continue;
        const references = getEdgeReferences(provider, consumerRefs);
        const label = references.length > 0
          ? references.slice(0, 2).join(', ') + (references.length > 2 ? '...' : '')
          : undefined;
        edges.push({
          id: `${providerId}->${consumerId}`,
          source: providerId,
          target: consumerId,
          type: 'smoothstep',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
          },
          label,
          data: { references },
        });
      }
    }

    return {
      nodes: layoutGraph(nodes, edges, direction),
      edges,
    };
  }, [
    sortedCells,
    dependencies,
    resolvedDependencyGraph,
    circularDependencyCells,
    staleCells,
    getCellState,
    direction,
  ]);
}
