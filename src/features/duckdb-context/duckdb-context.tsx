import * as duckdb from '@duckdb/duckdb-wasm';
import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import { isSafeOpfsPath, normalizeOpfsPath } from '@utils/opfs';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AsyncDuckDBConnectionPool } from './duckdb-connection-pool';

// Context used to provide progress of duckdb initialization
type duckDBInitState = 'none' | 'loading' | 'ready' | 'error';
type DuckDBInitializerStatusContextType = {
  state: duckDBInitState;
  message: string;
};

type DuckDBInitializerContextType = () => Promise<AsyncDuckDBConnectionPool | null>;

// Create context that supplies the messages and changes during initialization
export const DuckDBInitializerStatusContext =
  createContext<DuckDBInitializerStatusContextType | null>(null);
export const useDuckDBInitializerStatus = (): DuckDBInitializerStatusContextType =>
  useContext(DuckDBInitializerStatusContext)!;

// Create context that supplies the lazy function to connect to DuckDB
export const DuckDBInitializerContext = createContext<DuckDBInitializerContextType | null>(null);
export const useDuckDBInitializer = (): DuckDBInitializerContextType =>
  useContext(DuckDBInitializerContext)!;

// Create context that supplies the DuckDB connection pool
export const DuckDBConnPoolContext = createContext<AsyncDuckDBConnectionPool | null>(null);

/**
 * A hook to get the DuckDB connection and database instance after initialization.
 *
 * To get the connection and database at any time, use `useDuckDBConnection` instead.
 *
 * @throws Error if the context is not available or if the connection and database are not initialized.
 * @returns DuckDB connection and database instance
 */
export const useInitializedDuckDBConnectionPool = (): AsyncDuckDBConnectionPool => {
  const conn = useContext(DuckDBConnPoolContext);

  if (!conn) {
    throw new Error(
      "`useInitializedDuckDBConnectionPool` should not be used, unless app state is `ready`. Database initialization failed or haven't finished yet.",
    );
  }

  return conn;
};

export const useDuckDBConnectionPool = (): AsyncDuckDBConnectionPool | null =>
  useContext(DuckDBConnPoolContext)!;

export const DuckDBConnectionPoolProvider = ({
  maxPoolSize,
  children,
  onStatusUpdate,
}: {
  maxPoolSize: number;
  children: React.ReactNode;
  onStatusUpdate?: (status: {
    state: 'none' | 'loading' | 'ready' | 'error';
    message: string;
  }) => void;
}) => {
  const [initStatus, setInitStatus] = useState<DuckDBInitializerStatusContextType>({
    state: 'none',
    message: "DuckDB initialization hasn't started yet",
  });

  const [connectionPool, setConnectionPool] = useState<AsyncDuckDBConnectionPool | null>(null);

  const DEFAULT_MAX_POOL_SIZE = 30;
  const normalizedPoolSize = Math.max(5, Math.min(maxPoolSize || DEFAULT_MAX_POOL_SIZE, 50));

  // Get persistence state from context
  const { persistenceState, updatePersistenceState } = useDuckDBPersistence();

  // Use static cdn hosted bundles
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  // create a logger
  const logger = new duckdb.ConsoleLogger(
    import.meta.env.DEV ? duckdb.LogLevel.INFO : duckdb.LogLevel.WARNING,
  );

  // duckdb worker and blob URL references
  const worker = useRef<Worker | null>(null);
  const workerBlobUrl = useRef<string | null>(null);

  // terminate worker and revoke blob URL on unmount
  useEffect(
    () => () => {
      // Terminate the worker
      if (worker.current != null) {
        worker.current.terminate();
        worker.current = null;
      }

      // Revoke the blob URL
      if (workerBlobUrl.current != null) {
        URL.revokeObjectURL(workerBlobUrl.current);
        workerBlobUrl.current = null;
      }
    },
    [],
  );

  // Single reference for the in-flight promise
  const inFlight = useRef<Promise<AsyncDuckDBConnectionPool | null> | null>(null);

  // Memoize the status update function to prevent render loops
  const memoizedStatusUpdate = useCallback(
    (status: { state: 'none' | 'loading' | 'ready' | 'error'; message: string }) => {
      // First update local state
      setInitStatus(status);
      // Then forward to parent if provided
      onStatusUpdate?.(status);
    },
    [onStatusUpdate],
  );

  const connectDuckDb = useCallback(async (): Promise<AsyncDuckDBConnectionPool | null> => {
    // If we already have a connection request in flight, return it
    if (inFlight.current) {
      return inFlight.current;
    }

    // Check if the persistence state is valid before proceeding
    if (!persistenceState || !persistenceState.dbPath) {
      setInitStatus({
        state: 'error',
        message: 'Persistence state not initialized properly.',
      });
      return null;
    }

    // Create a local promise we can track for error handling
    const connectionPromise = (async (): Promise<AsyncDuckDBConnectionPool | null> => {
      try {
        // Set the state to loading and forward to parent
        memoizedStatusUpdate({
          state: 'loading',
          message: 'Starting DuckDB worker...',
        });

        // Resolve bundle
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        // Create a blob URL for the worker script
        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
        );

        // Store the URL in the ref for cleanup on unmount
        workerBlobUrl.current = worker_url;

        // Create worker and database
        let newDb: duckdb.AsyncDuckDB;
        try {
          worker.current = new Worker(worker_url);
          newDb = new duckdb.AsyncDuckDB(logger, worker.current);
          memoizedStatusUpdate({
            state: 'loading',
            message: 'Loading DuckDB... 0%',
          });
        } catch (e: any) {
          const errorMessage = `Error setting up DuckDB worker: ${e.toString()}`;
          console.error(errorMessage);
          memoizedStatusUpdate({
            state: 'error',
            message: import.meta.env.DEV ? errorMessage : 'Failed to initialize database worker',
          });
          throw e; // Rethrow to trigger error handler
        }

        // Instantiate DuckDB
        try {
          await newDb.instantiate(
            bundle.mainModule,
            bundle.pthreadWorker,
            (p: duckdb.InstantiationProgress) => {
              if (p.bytesLoaded > 0) {
                // Do not ask why * 10.0... taken from duckdb-wasm-shell, looks like either of the two
                // values have incorrect magnitude
                const progress = Math.max(
                  Math.min(Math.ceil((p.bytesLoaded / p.bytesTotal) * 10.0), 100.0),
                  0.0,
                );
                try {
                  memoizedStatusUpdate({
                    state: 'loading',
                    message: `Loading DuckDB... ${progress}%`,
                  });
                } catch (e: any) {
                  console.warn(`progress handler failed with error: ${e.toString()}`);
                }
              } else {
                memoizedStatusUpdate({
                  state: 'loading',
                  message: 'Loading DuckDB...',
                });
              }
            },
          );
        } catch (e: any) {
          const errorMessage = `Error instantiating DuckDB: ${e.toString()}`;
          console.error(errorMessage);
          memoizedStatusUpdate({
            state: 'error',
            message: import.meta.env.DEV ? errorMessage : 'Failed to initialize database',
          });
          throw e; // Rethrow to trigger error handler
        }

        // Open a database with the OPFS path - no fallback to in-memory
        try {
          memoizedStatusUpdate({
            state: 'loading',
            message: 'Opening persistent database...',
          });

          // Ensure the path format is correct and safe
          let { dbPath } = persistenceState;

          // Make sure the path starts with opfs://
          if (!dbPath.startsWith('opfs://')) {
            dbPath = `opfs://${dbPath.replace(/^opfs:/, '')}`;
          }

          // Validate the path to prevent path traversal attacks
          if (!isSafeOpfsPath(dbPath)) {
            const normalizedPath = normalizeOpfsPath(dbPath);
            console.error('Invalid or unsafe database path detected');
            throw new Error(
              import.meta.env.DEV
                ? `Invalid or unsafe database path: ${normalizedPath}`
                : 'Invalid database configuration',
            );
          }

          // Log the path for debugging
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('Opening DuckDB with path:', dbPath);
          }

          await newDb.open({
            path: dbPath,
            accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
            query: {
              // Enable Apache Arrow type and value patching DECIMAL -> DOUBLE on query materialization
              // https://github.com/apache/arrow/issues/37920
              castDecimalToDouble: true,
            },
          });
        } catch (e: any) {
          // Handle connection error - no fallback to in-memory mode
          const errorMessage = `Error opening persistent database: ${e.toString()}`;
          console.error(errorMessage);
          memoizedStatusUpdate({
            state: 'error',
            message: import.meta.env.DEV ? errorMessage : 'Failed to open persistent database',
          });
          throw e; // Rethrow to trigger error handler
        }

        // Finally, get the connection
        try {
          // Create a connection pool with the update state callback (always persistent)
          memoizedStatusUpdate({
            state: 'loading',
            message: 'Initializing connection pool...',
          });

          // Create a connection pool with configurable checkpoint settings
          const pool = new AsyncDuckDBConnectionPool(
            newDb,
            normalizedPoolSize,
            updatePersistenceState, // Always use the persistence callback
            {
              // Default configuration that balances performance and data safety
              throttleMs: import.meta.env.DEV ? 5000 : 10000, // More frequent in dev, less in prod
              maxChangesBeforeForce: 100,
              checkpointOnClose: true,
              // Only log checkpoints in development mode
              logCheckpoints: import.meta.env.DEV,
            },
          );

          setConnectionPool(pool);
          memoizedStatusUpdate({
            state: 'ready',
            message: 'DuckDB is ready with OPFS persistence!',
          });

          // Initial state update for persistence
          await updatePersistenceState();

          return pool;
        } catch (e: any) {
          const errorMessage = `Error getting DuckDB connection: ${e.toString()}`;
          console.error(errorMessage);
          memoizedStatusUpdate({
            state: 'error',
            message: import.meta.env.DEV ? errorMessage : 'Failed to initialize connection pool',
          });
          throw e; // Rethrow to trigger error handler
        }
      } catch (e: any) {
        // Catch any uncaught errors in the initialization process
        console.error('Uncaught error in DuckDB initialization:', e);
        memoizedStatusUpdate({
          state: 'error',
          message: import.meta.env.DEV
            ? `Unexpected error during DuckDB initialization: ${e.toString()}`
            : 'Failed to initialize database',
        });
        return null;
      }
    })();

    // Store the promise and add error handling
    inFlight.current = connectionPromise;

    // Add proper cleanup if errors occur
    connectionPromise.catch(() => {
      // Always clear the inFlight reference on error
      inFlight.current = null;
    });

    return connectionPromise;
  }, [persistenceState.dbPath, updatePersistenceState, normalizedPoolSize, memoizedStatusUpdate]);

  // If we're being managed by a parent component (like PersistenceConnector),
  // we'll just forward status updates but not show our own UI
  return (
    <DuckDBInitializerContext.Provider value={connectDuckDb}>
      <DuckDBInitializerStatusContext.Provider value={initStatus}>
        <DuckDBConnPoolContext.Provider value={connectionPool}>
          {children}
        </DuckDBConnPoolContext.Provider>
      </DuckDBInitializerStatusContext.Provider>
    </DuckDBInitializerContext.Provider>
  );
};
