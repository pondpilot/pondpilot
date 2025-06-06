import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { SchemaBrowserTab } from '@models/tab';
import {
  useAppStore,
  useFlatFileDataSourceMap,
  useDatabaseDataSourceMap,
  useLocalDBMetadata,
} from '@store/app-store';
import { useState, useEffect } from 'react';

import { SchemaGraph } from '../model';
import {
  clearExpiredCache,
  createCacheKey,
  getCachedSchemaData,
  setCachedSchemaData,
  processFileSource,
  processDbSource,
  processFolderSource,
  categorizeError,
  SchemaError,
} from '../utils';

/**
 * Hook to fetch and manage schema data for visualization
 *
 * This hook handles:
 * - Fetching schema information based on tab type (flat file, local entry, local DB)
 * - Caching schema data with 15-minute TTL to improve performance
 * - Error handling and loading states
 * - Constraint information (primary keys, foreign keys, NOT NULL)
 *
 * @param tab - The schema browser tab configuration
 * @param pool - DuckDB connection pool for executing queries
 * @param forceRefresh - Optional counter to force refresh the data and bypass cache
 * @returns Object containing loading state, schema data, and any error messages
 *
 * @example
 * ```tsx
 * const [forceRefresh, setForceRefresh] = useState(0);
 * const { isLoading, schemaData, error } = useSchemaData(tab, pool, forceRefresh);
 *
 * // Force refresh
 * setForceRefresh(prev => prev + 1);
 * ```
 */
export function useSchemaData(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: AsyncDuckDBConnectionPool,
  forceRefresh?: number,
): { isLoading: boolean; schemaData: SchemaGraph | null; error: SchemaError | null } {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [schemaData, setSchemaData] = useState<SchemaGraph | null>(null);
  const [error, setError] = useState<SchemaError | null>(null);

  const localEntries = useAppStore((state) => state.localEntries);
  const flatFileSources = useFlatFileDataSourceMap();
  const dbSources = useDatabaseDataSourceMap();
  const dbMetadata = useLocalDBMetadata();

  useEffect(() => {
    // Create abort controller for cancellation
    const abortController = new AbortController();

    const fetchSchemaData = async () => {
      // Clear expired entries periodically
      clearExpiredCache();

      const cacheKey = createCacheKey(tab);

      // Check cache first (skip cache if forceRefresh is provided)
      if (!forceRefresh) {
        const cached = getCachedSchemaData(cacheKey);
        if (cached) {
          setSchemaData(cached);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        let schemaGraph: SchemaGraph;

        switch (tab.sourceType) {
          case 'file':
            schemaGraph = await processFileSource(
              tab,
              pool,
              flatFileSources,
              abortController.signal,
            );
            break;

          case 'db':
            schemaGraph = await processDbSource(
              tab,
              pool,
              dbSources,
              dbMetadata,
              abortController.signal,
            );
            break;

          case 'folder':
            schemaGraph = await processFolderSource(
              tab,
              pool,
              localEntries,
              flatFileSources,
              abortController.signal,
            );
            break;

          default:
            schemaGraph = {
              nodes: [],
              edges: [],
            };
        }

        // Cache the result
        setCachedSchemaData(cacheKey, schemaGraph);
        setSchemaData(schemaGraph);
        setError(null);
      } catch (fetchError) {
        // Check if the error was due to abort
        if (abortController.signal.aborted) {
          // Schema data fetch was cancelled
          return;
        }

        // Categorize the error
        const schemaError = categorizeError(fetchError, {
          sourceId: tab.sourceId,
          sourceType: tab.sourceType,
          schemaName: tab.schemaName,
          nodeCount: tab.objectNames?.length,
        });

        console.error('Error fetching schema data:', schemaError);
        setError(schemaError);
        // Set empty schema data on error
        setSchemaData({
          nodes: [],
          edges: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchemaData();

    // Cleanup function to cancel the request when component unmounts or dependencies change
    return () => {
      abortController.abort();
    };
  }, [tab, pool, localEntries, flatFileSources, dbSources, dbMetadata, forceRefresh]);

  return { isLoading, schemaData, error };
}
