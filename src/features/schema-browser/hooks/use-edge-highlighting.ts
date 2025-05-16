import { useEffect } from 'react';
import { Edge, useNodesState } from 'reactflow';

import { SchemaNodeData } from '../model';

export function useEdgeHighlighting(
  selectedEdge: string | null,
  edges: Edge[],
  isLoading: boolean,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaNodeData>([]);

  useEffect(() => {
    if (!isLoading && nodes.length > 0) {
      const selectedEdgeData = selectedEdge ? edges.find((e) => e.id === selectedEdge) : null;

      setNodes((prevNodes) => {
        return prevNodes.map((node) => {
          let isHighlighted = false;
          const highlightedColumns: string[] = [];

          if (selectedEdgeData) {
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

          // Only update if highlighting state actually changed
          const currentHighlighted = node.data.isHighlighted || false;
          const currentColumns = node.data.highlightedColumns || [];

          if (
            currentHighlighted === isHighlighted &&
            currentColumns.length === highlightedColumns.length &&
            currentColumns.every((col: string, i: number) => col === highlightedColumns[i])
          ) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              isHighlighted,
              highlightedColumns,
            },
          };
        });
      });
    }
  }, [selectedEdge, edges, isLoading, setNodes, nodes.length]);

  return { nodes, setNodes, onNodesChange };
}
