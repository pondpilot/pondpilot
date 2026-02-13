import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Manages a shared DuckDB connection for a notebook session.
 *
 * Temp views are connection-scoped in DuckDB, so all cell executions
 * within a notebook must use the same connection to reference each other's
 * results. This hook acquires a pooled connection lazily and keeps it
 * alive across multiple cell executions.
 *
 * The connection is released when the component unmounts (notebook tab closed).
 */
export function useNotebookConnection(pool: AsyncDuckDBConnectionPool) {
  const connRef = useRef<AsyncDuckDBPooledConnection | null>(null);
  const acquiringRef = useRef<Promise<AsyncDuckDBPooledConnection> | null>(null);
  const unmountedRef = useRef(false);

  const getConnection = useCallback(async (): Promise<AsyncDuckDBPooledConnection> => {
    // If we have a live connection, return it
    if (connRef.current && !connRef.current.closed) {
      return connRef.current;
    }

    // If another caller is already acquiring, wait for the same promise
    if (acquiringRef.current) {
      return acquiringRef.current;
    }

    // Acquire a new connection from the pool
    const acquirePromise = pool.getPooledConnection().then((conn) => {
      acquiringRef.current = null;
      // If unmounted while acquiring, close immediately to avoid leak
      if (unmountedRef.current) {
        conn.close();
        throw new Error('Component unmounted during connection acquisition');
      }
      connRef.current = conn;
      return conn;
    });

    acquiringRef.current = acquirePromise;

    try {
      return await acquirePromise;
    } catch (error) {
      acquiringRef.current = null;
      throw error;
    }
  }, [pool]);

  // Release the connection when the notebook tab unmounts or pool changes
  useEffect(() => {
    // Reset unmounted flag on mount / pool change
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      if (connRef.current && !connRef.current.closed) {
        connRef.current.close();
      }
      connRef.current = null;
      acquiringRef.current = null;
    };
  }, [pool]);

  return { getConnection };
}
