import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useMantineColorScheme } from '@mantine/core';
import { SchemaBrowserTab } from '@models/tab';
import { memo, useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  Panel,
  EdgeMouseHandler,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  TableNode,
  AngledEdge,
  SchemaLoading,
  SchemaErrorEnhanced,
  SchemaTitle,
  SchemaControls,
  SchemaWarning,
} from './components';
import { useSchemaData, useSchemaLayout } from './hooks';
import { getSchemaStats } from './utils';

// Define node and edge types outside the component to prevent recreation
const nodeTypes: NodeTypes = Object.freeze({
  tableNode: TableNode,
});

const edgeTypes: EdgeTypes = Object.freeze({
  angled: AngledEdge,
});

/**
 * Props for the SchemaBrowser component
 */
interface SchemaBrowserProps {
  /** Schema browser tab configuration containing data source information */
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>;
}

const SchemaBrowserComponent = ({ tab }: SchemaBrowserProps) => {
  const conn = useInitializedDuckDBConnectionPool();

  // Direction state for layout (TB = top to bottom, LR = left to right)
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB');
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  // Initialize schema data based on the tab type
  const [forceRefresh, setForceRefresh] = useState(0);
  const { schemaData, isLoading, error } = useSchemaData(tab, conn, forceRefresh);

  // Use schema layout hook for managing nodes and edges
  const { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange } = useSchemaLayout(
    schemaData,
    isLoading,
    direction,
  );

  // Get schema statistics for performance monitoring
  const schemaStats = schemaData
    ? getSchemaStats(schemaData.nodes.length, schemaData.edges.length)
    : null;

  // Track dark mode for background color
  const { colorScheme } = useMantineColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // Handle edge selection
  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      setSelectedEdge(edge.id);
    },
    [setSelectedEdge],
  );

  // Handle clicking on empty space
  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
  }, [setSelectedEdge]);

  // Handle edge change events (including selection)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  // Update highlighting when selection changes
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

  return (
    <div className="w-full h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      {isLoading ? (
        <SchemaLoading />
      ) : error ? (
        <SchemaErrorEnhanced error={error} onRetry={() => setForceRefresh((prev) => prev + 1)} />
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          {schemaStats && (schemaStats.warningMessage || schemaStats.limitMessage) && (
            <Panel position="top-center">
              <SchemaWarning
                warningMessage={schemaStats.warningMessage}
                limitMessage={schemaStats.limitMessage}
              />
            </Panel>
          )}

          <Panel position="top-right">
            <div className="p-2 bg-white dark:bg-slate-800 rounded shadow">
              <SchemaTitle tab={tab} nodeCount={nodes.length} />
            </div>
          </Panel>

          <Panel position="top-left">
            <SchemaControls
              direction={direction}
              isLoading={isLoading}
              onDirectionChange={() => setDirection((prev) => (prev === 'TB' ? 'LR' : 'TB'))}
              onRefresh={() => setForceRefresh((prev) => prev + 1)}
            />
          </Panel>
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Background
            variant={BackgroundVariant.Dots}
            gap={12}
            size={1}
            color={isDarkMode ? '#334155' : '#e2e8f0'}
          />
        </ReactFlow>
      )}
    </div>
  );
};

/**
 * Schema Browser component for visualizing database schemas and relationships
 *
 * Features:
 * - Interactive graph visualization of database tables and columns
 * - Foreign key relationship visualization with column-to-column connections
 * - Automatic layout using dagre algorithm
 * - Performance optimizations for large schemas
 * - Filtering and statistics for schema management
 * - Dark/light theme support
 * - Exportable as PNG image
 *
 * @component
 * @example
 * ```tsx
 * <SchemaBrowser tab={schemaBrowserTab} />
 * ```
 */
export const SchemaBrowser = memo(SchemaBrowserComponent);
SchemaBrowser.displayName = 'SchemaBrowser';

export default SchemaBrowser;
