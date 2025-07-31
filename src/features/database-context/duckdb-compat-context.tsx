import { ConnectionPoolAdapter } from '@engines/connection-pool-adapter';
import { DatabaseEngineFactory } from '@engines/database-engine-factory';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  DuckDBInitializerStatusContext,
  DuckDBInitializerContext,
  DuckDBConnPoolContext,
} from '@features/duckdb-context/duckdb-context';
import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import React, { useEffect, useState } from 'react';

import {
  DatabaseConnectionPoolProvider,
  useDatabaseConnectionPool,
  useDatabaseInitializer,
  useDatabaseInitializerStatus,
} from './database-context';

/**
 * Compatibility provider that bridges the new database abstraction with
 * the existing DuckDB context that the app expects
 */
export const DuckDBCompatProvider: React.FC<{
  maxPoolSize: number;
  children: React.ReactNode;
  onStatusUpdate?: (status: {
    state: 'none' | 'loading' | 'ready' | 'error';
    message: string;
  }) => void;
}> = ({ maxPoolSize, children, onStatusUpdate }) => {
  return (
    <DatabaseConnectionPoolProvider maxPoolSize={maxPoolSize} onStatusUpdate={onStatusUpdate}>
      <DuckDBCompatBridge>{children}</DuckDBCompatBridge>
    </DatabaseConnectionPoolProvider>
  );
};

const DuckDBCompatBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dbPool = useDatabaseConnectionPool();
  const dbInitializer = useDatabaseInitializer();
  const dbStatus = useDatabaseInitializerStatus();
  const { updatePersistenceState } = useDuckDBPersistence();
  const [adaptedPool, setAdaptedPool] = useState<AsyncDuckDBConnectionPool | null>(null);

  // Convert the generic pool to AsyncDuckDBConnectionPool when available
  useEffect(() => {
    if (dbPool) {
      // Check if we're using DuckDB WASM engine
      const detectedEngine = DatabaseEngineFactory.detectOptimalEngine();
      if (detectedEngine.type === 'duckdb-wasm') {
        // For web/WASM, the pool is already an AsyncDuckDBConnectionPool
        setAdaptedPool(dbPool as any as AsyncDuckDBConnectionPool);
      } else {
        // For Tauri and other engines, use the adapter
        const adapter = new ConnectionPoolAdapter(dbPool, updatePersistenceState);
        setAdaptedPool(adapter as any as AsyncDuckDBConnectionPool);
      }
    }
  }, [dbPool, updatePersistenceState]);

  // Create a wrapper for the initializer that returns the adapted pool
  const duckdbInitializer = async () => {
    const pool = await dbInitializer();
    if (pool) {
      // Check if we're using DuckDB WASM engine
      const detectedEngine = DatabaseEngineFactory.detectOptimalEngine();
      if (detectedEngine.type === 'duckdb-wasm') {
        // For web/WASM, the pool is already an AsyncDuckDBConnectionPool
        return pool as any as AsyncDuckDBConnectionPool;
      }
      // For Tauri and other engines, use the adapter
      return new ConnectionPoolAdapter(
        pool,
        updatePersistenceState,
      ) as any as AsyncDuckDBConnectionPool;
    }
    return null;
  };

  return (
    <DuckDBInitializerStatusContext.Provider value={dbStatus}>
      <DuckDBInitializerContext.Provider value={duckdbInitializer}>
        <DuckDBConnPoolContext.Provider value={adaptedPool}>
          {children}
        </DuckDBConnPoolContext.Provider>
      </DuckDBInitializerContext.Provider>
    </DuckDBInitializerStatusContext.Provider>
  );
};
