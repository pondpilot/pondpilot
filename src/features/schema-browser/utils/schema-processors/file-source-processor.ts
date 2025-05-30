import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';
import { SchemaBrowserTab } from '@models/tab';

import { processSingleFileSource, processMultipleFileSources } from './common';
import { SchemaGraph } from '../../model';

/**
 * Process schema for individual file source or multiple file sources
 */
export async function processFileSource(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: AsyncDuckDBConnectionPool,
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>,
  abortSignal: AbortSignal,
): Promise<SchemaGraph> {
  // Handle single file source
  if (tab.sourceId && flatFileSources.has(tab.sourceId as PersistentDataSourceId)) {
    const source = flatFileSources.get(tab.sourceId as PersistentDataSourceId)!;
    const { node } = await processSingleFileSource(source, pool, abortSignal);

    return {
      nodes: node ? [node] : [],
      edges: [],
    };
  }

  // Handle multiple file sources (passed in objectNames)
  if (!tab.sourceId && tab.objectNames && tab.objectNames.length > 0) {
    return processMultipleFileSources(
      tab.objectNames,
      flatFileSources,
      pool,
      abortSignal,
      'vertical',
    );
  }

  return {
    nodes: [],
    edges: [],
  };
}
