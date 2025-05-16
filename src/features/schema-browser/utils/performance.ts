import { WARN_NODE_COUNT, MAX_NODE_COUNT, MAX_EDGE_COUNT } from '../constants';

/**
 * Get display statistics for schema data
 */
export function getSchemaStats(nodeCount: number, edgeCount: number) {
  return {
    isLarge: nodeCount > WARN_NODE_COUNT,
    exceedsLimit: nodeCount > MAX_NODE_COUNT,
    nodeCount,
    edgeCount,
    warningMessage:
      nodeCount > WARN_NODE_COUNT
        ? `Large schema detected: ${nodeCount} tables. Performance may be affected.`
        : undefined,
    limitMessage:
      nodeCount > MAX_NODE_COUNT
        ? `Schema too large: Showing first ${MAX_NODE_COUNT} of ${nodeCount} tables.`
        : undefined,
  };
}

/**
 * Filter nodes and edges for performance
 */
export function filterForPerformance<
  T extends { id: string },
  E extends { source: string; target: string },
>(nodes: T[], edges: E[], maxNodes = MAX_NODE_COUNT, maxEdges = MAX_EDGE_COUNT) {
  // Limit nodes
  const filteredNodes = nodes.slice(0, maxNodes);
  const nodeIds = new Set(filteredNodes.map((n) => n.id));

  // Filter edges to only include those between visible nodes
  const filteredEdges = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, maxEdges);

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    hasMore: nodes.length > maxNodes || edges.length > maxEdges,
  };
}
