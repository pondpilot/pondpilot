import { Node } from 'reactflow';

import {
  CIRCLE_LAYOUT_THRESHOLD,
  MIN_CIRCLE_RADIUS,
  CIRCLE_RADIUS_MULTIPLIER,
  CIRCLE_CENTER,
  GRID_START_X,
  GRID_START_Y,
  GRID_SPACING_X,
  GRID_SPACING_Y,
} from '../constants';
import { SchemaNodeData } from '../model';

/**
 * Node position generation strategies
 */
export enum PositionStrategy {
  AUTO = 'auto',
  CIRCLE = 'circle',
  GRID = 'grid',
  DAGRE = 'dagre',
}

/**
 * Interface for position generation options
 */
export interface PositionOptions {
  strategy?: PositionStrategy;
  startPosition?: { x: number; y: number };
  spacing?: { x: number; y: number };
  radius?: number;
  center?: { x: number; y: number };
}

/**
 * Generates position for a single node based on index and total nodes
 * @param index - Current node index
 * @param totalNodes - Total number of nodes
 * @param options - Optional positioning configuration
 * @returns Position object with x and y coordinates
 */
export function generateNodePosition(
  index: number,
  totalNodes: number,
  options: PositionOptions = {},
): { x: number; y: number } {
  const strategy = options.strategy || PositionStrategy.AUTO;

  // Auto-select strategy based on node count
  if (strategy === PositionStrategy.AUTO) {
    if (totalNodes <= CIRCLE_LAYOUT_THRESHOLD) {
      return generateCirclePosition(index, totalNodes, options);
    }
    return generateGridPosition(index, totalNodes, options);
  }

  switch (strategy) {
    case PositionStrategy.CIRCLE:
      return generateCirclePosition(index, totalNodes, options);
    case PositionStrategy.GRID:
      return generateGridPosition(index, totalNodes, options);
    default:
      return generateGridPosition(index, totalNodes, options);
  }
}

/**
 * Generate position in a circle layout
 * @param index - Current node index
 * @param totalNodes - Total number of nodes
 * @param options - Optional positioning configuration
 * @returns Position object with x and y coordinates
 */
function generateCirclePosition(
  index: number,
  totalNodes: number,
  options: PositionOptions = {},
): { x: number; y: number } {
  const center = options.center || CIRCLE_CENTER;
  const radius =
    options.radius || Math.min(MIN_CIRCLE_RADIUS, totalNodes * CIRCLE_RADIUS_MULTIPLIER);
  const angle = (index / totalNodes) * 2 * Math.PI;

  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

/**
 * Generate position in a grid layout
 * @param index - Current node index
 * @param totalNodes - Total number of nodes
 * @param options - Optional positioning configuration
 * @returns Position object with x and y coordinates
 */
function generateGridPosition(
  index: number,
  totalNodes: number,
  options: PositionOptions = {},
): { x: number; y: number } {
  const startPosition = options.startPosition || { x: GRID_START_X, y: GRID_START_Y };
  const spacing = options.spacing || { x: GRID_SPACING_X, y: GRID_SPACING_Y };

  const itemsPerRow = Math.ceil(Math.sqrt(totalNodes));
  const row = Math.floor(index / itemsPerRow);
  const col = index % itemsPerRow;

  return {
    x: startPosition.x + col * spacing.x,
    y: startPosition.y + row * spacing.y,
  };
}

/**
 * Creates positioned nodes for a schema visualization
 * @param schemaNodes - Array of schema node data
 * @param options - Optional positioning configuration
 * @returns Array of ReactFlow nodes with positions
 */
export function createPositionedNodes(
  schemaNodes: SchemaNodeData[],
  options: PositionOptions = {},
): Node<SchemaNodeData>[] {
  return schemaNodes.map((nodeData, index) => {
    const position = generateNodePosition(index, schemaNodes.length, options);
    return {
      id: nodeData.id,
      data: nodeData,
      position,
      type: 'tableNode',
    };
  });
}

/**
 * Updates positions for existing nodes
 * @param nodes - Array of ReactFlow nodes
 * @param options - Optional positioning configuration
 * @returns Array of nodes with updated positions
 */
export function updateNodePositions(
  nodes: Node<SchemaNodeData>[],
  options: PositionOptions = {},
): Node<SchemaNodeData>[] {
  return nodes.map((node, index) => {
    const position = generateNodePosition(index, nodes.length, options);
    return {
      ...node,
      position,
    };
  });
}

/**
 * Get position for a specific node in relation to others
 * @param nodeId - ID of the node to position
 * @param allNodes - All nodes in the schema
 * @param options - Optional positioning configuration
 * @returns Position object with x and y coordinates
 */
export function getNodePosition(
  nodeId: string,
  allNodes: Node<SchemaNodeData>[],
  options: PositionOptions = {},
): { x: number; y: number } | null {
  const index = allNodes.findIndex((node) => node.id === nodeId);
  if (index === -1) return null;

  return generateNodePosition(index, allNodes.length, options);
}

/**
 * Determines if nodes should be repositioned based on changes
 * @param oldNodes - Previous nodes array
 * @param newNodes - New nodes array
 * @returns Boolean indicating if repositioning is needed
 */
export function needsRepositioning(
  oldNodes: Node<SchemaNodeData>[],
  newNodes: Node<SchemaNodeData>[],
): boolean {
  // Different number of nodes
  if (oldNodes.length !== newNodes.length) return true;

  // Check if node IDs have changed
  const oldIds = new Set(oldNodes.map((n) => n.id));
  const newIds = new Set(newNodes.map((n) => n.id));

  for (const id of newIds) {
    if (!oldIds.has(id)) return true;
  }

  return false;
}
