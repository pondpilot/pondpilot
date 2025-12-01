import { ConnectionPool } from '@engines/types';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';

import { DEFAULT_NODE_POSITION } from '../../constants';
import { SchemaGraph, SchemaNodeData } from '../../model';
import { createForeignKeyEdges } from '../edges';
import { generateNodePosition } from '../node-positioning';
import { extractFlatFileSchema, createSchemaNode } from '../schema-extraction';

/**
 * Process a single file source and add it to the schema graph
 */
export async function processSingleFileSource(
  source: AnyFlatFileDataSource,
  pool: ConnectionPool,
  abortSignal: AbortSignal,
  position: { x: number; y: number } = DEFAULT_NODE_POSITION,
): Promise<{ node: ReturnType<typeof createSchemaNode> | null; nodeData: SchemaNodeData | null }> {
  const nodeData = await extractFlatFileSchema(source, pool, abortSignal);

  if (nodeData) {
    const node = createSchemaNode(nodeData, position);
    return { node, nodeData };
  }

  return { node: null, nodeData: null };
}

/**
 * Process multiple file sources and add them to the schema graph
 * @param sources - Array of source IDs to process
 * @param flatFileSources - Map of all available flat file sources
 * @param pool - DuckDB connection pool
 * @param abortSignal - Abort signal for cancellation
 * @param layoutStrategy - 'vertical' or 'circle' layout
 * @returns Schema graph with nodes and edges
 */
export async function processMultipleFileSources(
  sources: (PersistentDataSourceId | string)[],
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>,
  pool: ConnectionPool,
  abortSignal: AbortSignal,
  layoutStrategy: 'vertical' | 'circle' = 'vertical',
): Promise<SchemaGraph> {
  const schemaGraph: SchemaGraph = {
    nodes: [],
    edges: [],
  };

  const processedSources: SchemaNodeData[] = [];
  let nodeIndex = 0;
  let yOffset = 0;

  for (const sourceId of sources) {
    if (flatFileSources.has(sourceId as PersistentDataSourceId)) {
      const source = flatFileSources.get(sourceId as PersistentDataSourceId)!;

      try {
        let position: { x: number; y: number };
        if (layoutStrategy === 'vertical') {
          position = { x: DEFAULT_NODE_POSITION.x, y: DEFAULT_NODE_POSITION.y + yOffset };
          yOffset += 250; // Space nodes vertically
        } else {
          position = generateNodePosition(nodeIndex, sources.length);
        }

        const { node, nodeData } = await processSingleFileSource(
          source,
          pool,
          abortSignal,
          position,
        );

        if (node && nodeData) {
          schemaGraph.nodes.push(node);
          processedSources.push(nodeData);
          nodeIndex += 1;
        }
      } catch (processError) {
        const errorMessage = `Error processing schema for ${source.viewName}: ${
          processError instanceof Error ? processError.message : 'Unknown error'
        }`;
        console.error(errorMessage);
        // Continue processing other sources
      }
    }
  }

  // Create edges based on foreign key relationships
  if (processedSources.length > 1) {
    const edges = createForeignKeyEdges(processedSources);
    schemaGraph.edges.push(...edges);
  }

  return schemaGraph;
}
