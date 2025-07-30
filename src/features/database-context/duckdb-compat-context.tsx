import { ConnectionPoolAdapter } from '@engines/connection-pool-adapter';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  DuckDBInitializerStatusContext,
  DuckDBInitializerContext,
  DuckDBConnPoolContext,
} from '@features/duckdb-context/duckdb-context';
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
  const [adaptedPool, setAdaptedPool] = useState<AsyncDuckDBConnectionPool | null>(null);

  // Convert the generic pool to AsyncDuckDBConnectionPool when available
  useEffect(() => {
    if (dbPool) {
      // Get persistence callback from the original context if available
      const { updatePersistenceState } = window as any; // This would need proper integration
      const adapter = new ConnectionPoolAdapter(dbPool, updatePersistenceState);
      setAdaptedPool(adapter);
    }
  }, [dbPool]);

  // Create a wrapper for the initializer that returns the adapted pool
  const duckdbInitializer = async () => {
    const pool = await dbInitializer();
    if (pool) {
      const { updatePersistenceState } = window as any; // This would need proper integration
      return new ConnectionPoolAdapter(pool, updatePersistenceState);
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
