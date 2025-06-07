import { useEffect } from 'react';
import { Edge, Node } from 'reactflow';

import {
  EDGE_SELECTED_COLOR,
  EDGE_DEFAULT_COLOR,
  EDGE_SELECTED_STROKE_WIDTH,
  EDGE_STROKE_WIDTH,
} from '@features/schema-browser/constants';
import { SchemaNodeData } from '@features/schema-browser/model';
import { getConnectedTableIds, getConnectedEdgeIds } from '@features/schema-browser/utils';

/**
 * Custom hook to manage selection and highlighting of nodes and edges
 * @param nodes - Current nodes in the graph
 * @param edges - Current edges in the graph
 * @param selectedEdge - ID of the selected edge (if any)
 * @param selectedTable - ID of the selected table (if any)
 * @param isLoading - Whether data is currently loading
 * @param setNodes - Function to update nodes
 * @param setEdges - Function to update edges
 */
export function useSelectionHighlighting(
  nodes: Node<SchemaNodeData>[],
  edges: Edge[],
  selectedEdge: string | null,
  selectedTable: string | null,
  isLoading: boolean,
  setNodes: React.Dispatch<React.SetStateAction<Node<SchemaNodeData>[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
) {
  // Update node highlighting when selection changes
  useEffect(() => {
    if (!isLoading && nodes.length > 0) {
      const selectedEdgeData = selectedEdge ? edges.find((e) => e.id === selectedEdge) : null;
      const connectedTableIds = getConnectedTableIds(selectedTable, edges);

      setNodes((prevNodes) => {
        return prevNodes.map((node) => {
          let isHighlighted = false;
          const highlightedColumns: string[] = [];

          // Handle edge selection highlighting
          if (selectedEdgeData && !selectedTable) {
            if (selectedEdgeData.source === node.id) {
              isHighlighted = true;
              const columnName = selectedEdgeData.sourceHandle?.split('-').pop();
              if (columnName) {
                highlightedColumns.push(columnName);
              }
            } else if (selectedEdgeData.target === node.id) {
              isHighlighted = true;
              const { targetHandle } = selectedEdgeData;
              const columnName = targetHandle?.replace('-target', '').split('-').pop();
              if (columnName) {
                highlightedColumns.push(columnName);
              }
            }
          }

          // Handle table selection highlighting
          if (selectedTable && connectedTableIds.has(node.id)) {
            isHighlighted = true;
          }

          // Pass the selection handler for the table
          const isSelected = node.id === selectedTable;

          // Only update if highlighting state actually changed
          const currentHighlighted = node.data.isHighlighted || false;
          const currentColumns = node.data.highlightedColumns || [];
          const currentSelected = node.data.isSelected || false;

          if (
            currentHighlighted === isHighlighted &&
            currentColumns.length === highlightedColumns.length &&
            currentColumns.every((col: string, i: number) => col === highlightedColumns[i]) &&
            currentSelected === isSelected
          ) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              isHighlighted,
              highlightedColumns,
              isSelected,
            },
          };
        });
      });
    }
  }, [selectedEdge, selectedTable, edges, isLoading, setNodes]);

  // Update edge highlighting when selection changes
  useEffect(() => {
    if (!isLoading) {
      const connectedEdgeIds = getConnectedEdgeIds(selectedTable, edges);

      setEdges((prevEdges: Edge[]) => {
        return prevEdges.map((edge: Edge) => {
          const isHighlighted = selectedEdge === edge.id || connectedEdgeIds.has(edge.id);
          const currentHighlighted = edge.data?.isHighlighted || false;

          if (currentHighlighted === isHighlighted) {
            return edge;
          }

          return {
            ...edge,
            animated: isHighlighted,
            style: {
              ...edge.style,
              stroke: isHighlighted ? EDGE_SELECTED_COLOR : EDGE_DEFAULT_COLOR,
              strokeWidth: isHighlighted ? EDGE_SELECTED_STROKE_WIDTH : EDGE_STROKE_WIDTH,
            },
            data: {
              ...edge.data,
              isHighlighted,
            },
          };
        });
      });
    }
  }, [selectedEdge, selectedTable, isLoading, setEdges]);
}
