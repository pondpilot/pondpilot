import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useColorScheme } from '@mantine/hooks';
import { SchemaBrowserTab } from '@models/tab';
import { memo, useState, useCallback } from 'react';
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
  NodeMouseHandler,
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
import { DATA_ATTRIBUTES } from './constants';
import { useSchemaData, useSchemaLayout, useSelectionHighlighting } from './hooks';
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
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

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
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // Handle edge selection
  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      setSelectedEdge(edge.id);
      setSelectedTable(null);
    },
    [setSelectedEdge, setSelectedTable],
  );

  // Handle node click (for table selection)
  const onNodeClick = useCallback<NodeMouseHandler>((event, node) => {
    // Check if the click is on the header (we'll use a data attribute for this)
    const target = event.target as HTMLElement;
    if (target.closest(`[${DATA_ATTRIBUTES.TABLE_HEADER}]`)) {
      setSelectedTable((prevTable) => (prevTable === node.id ? null : node.id));
      setSelectedEdge(null);
    }
  }, []);

  // Handle clicking on empty space
  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
    setSelectedTable(null);
  }, [setSelectedEdge, setSelectedTable]);

  // Handle edge change events (including selection)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  // Use the custom hook for selection highlighting
  useSelectionHighlighting(
    nodes,
    edges,
    selectedEdge,
    selectedTable,
    isLoading,
    setNodes,
    setEdges,
  );

  return (
    <div className="w-full h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      {isLoading ? (
        <SchemaLoading />
      ) : error ? (
        <SchemaErrorEnhanced error={error} onRetry={() => setForceRefresh((prev) => prev + 1)} />
      ) : (
        <div data-testid="schema-browser-canvas" className="w-full h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={handleEdgesChange}
            onEdgeClick={onEdgeClick}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.05}
            maxZoom={2}
            panOnScroll={false}
            selectionOnDrag={false}
            selectNodesOnDrag={false}
            nodesDraggable
            elementsSelectable={false}
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
        </div>
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
