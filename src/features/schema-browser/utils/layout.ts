import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

import {
  NODE_WIDTH,
  NODE_HEIGHT_BASE,
  NODE_HEIGHT_PER_COLUMN,
  DAGRE_NODESEP_LR,
  DAGRE_NODESEP_TB,
  DAGRE_RANKSEP_LR,
  DAGRE_RANKSEP_TB,
  DAGRE_EDGESEP,
  DAGRE_MARGIN_X,
  DAGRE_MARGIN_Y,
} from '@features/schema-browser/constants';
import { SchemaNodeData, SchemaEdgeData } from '@features/schema-browser/model';

/**
 * Arranges nodes in a directed graph layout using dagre algorithm
 *
 * This function calculates optimal positions for nodes in a directed graph,
 * considering node dimensions and relationships between them.
 *
 * @param nodes - Array of ReactFlow nodes to position
 * @param edges - Array of ReactFlow edges for relationship information
 * @param direction - Layout direction: 'TB' (top-bottom) or 'LR' (left-right)
 * @returns Object containing positioned nodes and edges
 *
 * @example
 * ```ts
 * const { nodes, edges } = getLayoutedElements(schemaNodes, schemaEdges, 'LR');
 * // Nodes now have updated position properties
 * ```
 */
export function getLayoutedElements(
  nodes: Node<SchemaNodeData>[],
  edges: Edge<SchemaEdgeData>[],
  direction: 'LR' | 'TB' = 'TB',
) {
  if (nodes.length === 0) return { nodes, edges };

  // Initialize dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Set graph direction with more spacing
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? DAGRE_NODESEP_LR : DAGRE_NODESEP_TB,
    ranksep: direction === 'LR' ? DAGRE_RANKSEP_LR : DAGRE_RANKSEP_TB,
    edgesep: DAGRE_EDGESEP,
    marginx: DAGRE_MARGIN_X,
    marginy: DAGRE_MARGIN_Y,
  });

  // Add nodes to dagre graph with dimensions
  nodes.forEach((node) => {
    // Adjust node height based on number of columns
    const height = NODE_HEIGHT_BASE + (node.data?.columns?.length || 0) * NODE_HEIGHT_PER_COLUMN;
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout algorithm
  dagre.layout(dagreGraph);

  // Apply layout to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Skip nodes that dagre couldn't lay out
    if (!nodeWithPosition) return node;

    // Update node position
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y:
          nodeWithPosition.y -
          (NODE_HEIGHT_BASE + (node.data?.columns?.length || 0) * NODE_HEIGHT_PER_COLUMN) / 2,
      },
    };
  });

  // For edges with handles, adjust the handle position based on node layout
  const layoutedEdges = edges.map((edge) => {
    return {
      ...edge,
      // We don't need to adjust handle positions because they're defined in the TableNode component
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

/**
 * Applies automatic layout to nodes and edges using dagre algorithm
 *
 * This is a higher-level wrapper around getLayoutedElements that provides
 * a consistent interface for applying layout to schema visualization.
 *
 * @param nodes - Array of ReactFlow nodes to position
 * @param edges - Array of ReactFlow edges for relationship information
 * @param direction - Layout direction: 'TB' (top-bottom) or 'LR' (left-right)
 * @returns Object containing positioned nodes and edges
 *
 * @example
 * ```ts
 * const { nodes, edges } = applyAutoLayout(schemaNodes, schemaEdges, 'TB');
 * setNodes(nodes);
 * setEdges(edges);
 * ```
 */
export function applyAutoLayout(
  nodes: Node<SchemaNodeData>[],
  edges: Edge<SchemaEdgeData>[],
  direction: 'TB' | 'LR' = 'TB',
) {
  // Apply dagre layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    nodes,
    edges,
    direction,
  );

  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
  };
}
