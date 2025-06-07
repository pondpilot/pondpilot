import { useEffect, useRef } from 'react';
import { Node, Edge, useNodesState, useEdgesState } from 'reactflow';

import { SchemaNodeData, SchemaEdgeData } from '@features/schema-browser/model';
import { applyAutoLayout, filterForPerformance } from '@features/schema-browser/utils';

export function useSchemaLayout(
  schemaData: { nodes: Node<SchemaNodeData>[]; edges: Edge<SchemaEdgeData>[] } | null,
  isLoading: boolean,
  direction: 'TB' | 'LR',
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaEdgeData>([]);

  // Track the last schema data ID and direction to prevent unnecessary updates
  const lastLayoutKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (schemaData && !isLoading && schemaData.nodes.length > 0) {
      // Apply performance filtering
      const { nodes: filteredNodes, edges: filteredEdges } = filterForPerformance(
        schemaData.nodes,
        schemaData.edges,
      );

      // Create a unique identifier that includes both schema data and direction
      const schemaDataId = JSON.stringify(filteredNodes.map((n) => n.id).sort());
      const layoutKey = `${schemaDataId}-${direction}`;

      // Skip if we've already processed this exact combination
      if (lastLayoutKeyRef.current === layoutKey) {
        return;
      }

      lastLayoutKeyRef.current = layoutKey;

      const { nodes: layoutedNodes, edges: layoutedEdges } = applyAutoLayout(
        filteredNodes,
        filteredEdges,
        direction,
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [schemaData, isLoading, direction, setNodes, setEdges]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
  };
}
