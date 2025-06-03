import { Edge } from 'reactflow';

/**
 * Gets all table IDs that are connected to the selected table
 * @param selectedTable - The ID of the selected table
 * @param edges - All edges in the graph
 * @returns Set of connected table IDs including the selected table
 */
export function getConnectedTableIds(selectedTable: string | null, edges: Edge[]): Set<string> {
  const connectedTableIds = new Set<string>();

  if (selectedTable) {
    // Add the selected table itself
    connectedTableIds.add(selectedTable);

    // Find all tables connected via edges
    edges.forEach((edge) => {
      if (edge.source === selectedTable || edge.target === selectedTable) {
        connectedTableIds.add(edge.source);
        connectedTableIds.add(edge.target);
      }
    });
  }

  return connectedTableIds;
}

/**
 * Gets all edge IDs that are connected to the selected table
 * @param selectedTable - The ID of the selected table
 * @param edges - All edges in the graph
 * @returns Set of connected edge IDs
 */
export function getConnectedEdgeIds(selectedTable: string | null, edges: Edge[]): Set<string> {
  const connectedEdgeIds = new Set<string>();

  if (selectedTable) {
    edges.forEach((edge) => {
      if (edge.source === selectedTable || edge.target === selectedTable) {
        connectedEdgeIds.add(edge.id);
      }
    });
  }

  return connectedEdgeIds;
}
