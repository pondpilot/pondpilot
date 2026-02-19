import { configureConnectionForHttpfs } from '@controllers/db/httpfs-extension-controller';
import * as duckdb from '@duckdb/duckdb-wasm';
import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import { useTabCoordinationContext } from '@features/tab-coordination-context';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { setAppLoadState } from '@store/app-store';
import { isSafeOpfsPath, normalizeOpfsPath } from '@utils/opfs';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';

import { AsyncDuckDBConnectionPool } from './duckdb-connection-pool';

class DuckDBInitializationCancelledError extends Error {
  constructor(message = 'DuckDB initialization cancelled') {
    super(message);
    this.name = 'DuckDBInitializationCancelledError';
  }
}

const TAB_BLOCKED_STATUS_MESSAGE = 'DuckDB initialization paused because this tab is inactive.';

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
  const { isTabBlocked } = useTabCoordinationContext();
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
  const cancelTokenRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const ALLOW_UNSIGNED_EXTENSIONS =
    import.meta.env.VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS === 'true';
  const ENABLE_GSHEETS_COMMUNITY_EXTENSION =
    import.meta.env.VITE_DUCKDB_ENABLE_GSHEETS_EXTENSION === 'true';
  const READ_STAT_EXTENSION_URL = (() => {
    const raw = import.meta.env.VITE_READ_STAT_EXTENSION_URL ?? '';
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).toString();
    } catch (error) {
      console.warn('Invalid read_stat extension URL:', raw, error);
      return '';
    }
  })();
  const GSHEETS_EXTENSION_URL = (() => {
    const raw = import.meta.env.VITE_GSHEETS_EXTENSION_URL ?? '';
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).toString();
    } catch (error) {
      console.warn('Invalid gsheets extension URL:', raw, error);
      return '';
    }
  })();
  const cleanupWorkerResources = useCallback(() => {
    if (worker.current != null) {
      worker.current.terminate();
      worker.current = null;
    }

    if (workerBlobUrl.current != null) {
      URL.revokeObjectURL(workerBlobUrl.current);
      workerBlobUrl.current = null;
    }
  }, [worker, workerBlobUrl]);

  // terminate worker and revoke blob URL on unmount
  useEffect(
    () => () => {
      cleanupWorkerResources();
    },
    [cleanupWorkerResources],
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

  const cleanupConnectionResources = useCallback(
    async (reason?: string) => {
      // Prevent concurrent cleanup operations to avoid race conditions
      if (isCleaningUpRef.current) {
        console.warn('DuckDB cleanup already in progress, skipping duplicate cleanup');
        return;
      }

      isCleaningUpRef.current = true;

      try {
        inFlight.current = null;

        const activePool = connectionPool;

        if (activePool) {
          try {
            await activePool.close();
          } catch (error) {
            console.error('Failed to close DuckDB connection pool during cleanup:', error);
          } finally {
            setConnectionPool(null);
          }
        }

        cleanupWorkerResources();

        setAppLoadState('init');

        if (reason) {
          memoizedStatusUpdate({
            state: 'none',
            message: reason,
          });
        }
      } finally {
        isCleaningUpRef.current = false;
      }
    },
    [cleanupWorkerResources, connectionPool, memoizedStatusUpdate],
  );

  const connectDuckDb = useCallback(async (): Promise<AsyncDuckDBConnectionPool | null> => {
    // Don't initialize if this tab is blocked by another active tab
    if (isTabBlocked) {
      memoizedStatusUpdate({
        state: 'none',
        message: TAB_BLOCKED_STATUS_MESSAGE,
      });
      return null;
    }

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

    const cancellationToken = cancelTokenRef.current;
    const ensureNotCancelled = () => {
      if (cancellationToken !== cancelTokenRef.current) {
        throw new DuckDBInitializationCancelledError();
      }
    };

    // Create a local promise we can track for error handling
    const connectionPromise = (async (): Promise<AsyncDuckDBConnectionPool | null> => {
      try {
        // Set the state to loading and forward to parent
        memoizedStatusUpdate({
          state: 'loading',
          message: 'Starting DuckDB worker...',
        });

        ensureNotCancelled();

        // Resolve bundle
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        ensureNotCancelled();

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

        ensureNotCancelled();

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

        ensureNotCancelled();

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
            allowUnsignedExtensions: ALLOW_UNSIGNED_EXTENSIONS,
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

        ensureNotCancelled();

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
            (conn) =>
              configureConnectionForHttpfs(conn, {
                enableGsheetsCommunity: ENABLE_GSHEETS_COMMUNITY_EXTENSION,
                gsheetsExtensionUrl: GSHEETS_EXTENSION_URL,
              }),
          );

          /**
           * WORKAROUND: Addresses an issue with OPFS (Origin Private File System) and write mode
           * after a page reload in DuckDB-WASM.
           *
           * @problem When using DuckDB-WASM with OPFS for persistence, a problem arises where,
           * after a page reload, the OPFS database, even if opened in READ_WRITE mode,
           * does not always correctly restore its write-enabled state. This leads to an
           * "Error: TransactionContext Error: Failed to commit: File is not opened in write mode"
           * when attempting write operations (e.g., CREATE TABLE, INSERT) after the reload.
           *
           * @workaround To forcibly activate the write mode for OPFS during each
           * initialization (including those after a page reload), a harmless sequence of write
           * operations is performed: a temporary table with a unique name is created and
           * then immediately dropped. This ensures that the connection to OPFS is genuinely
           * ready for write operations before the application attempts any actual data-modifying queries.
           *
           * This workaround is a temporary measure pending a fix at the duckdb-wasm library level
           * (see related issue, PR https://github.com/duckdb/duckdb-wasm/pull/1962).
           */
          const name = v4();
          await pool.query(`CREATE OR REPLACE TABLE "${name}" as select 1;`);
          await pool.query(`DROP TABLE "${name}";`);

          // Cleanup any leftover UUID-named temporary tables from previous sessions
          try {
            // Query to find all tables with UUID-like names (36 chars with dashes in specific positions)
            const cleanupQuery = `
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_catalog = '${PERSISTENT_DB_NAME}' 
                AND table_schema = 'main'
                AND LENGTH(table_name) = 36
                AND table_name SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
            `;

            const result = await pool.query(cleanupQuery);
            const uuidTables = result.toArray();

            if (uuidTables.length > 0) {
              // eslint-disable-next-line no-console
              console.log(
                `Found ${uuidTables.length} leftover temporary UUID tables, cleaning up...`,
              );

              for (const row of uuidTables) {
                const tableName = row.table_name;
                try {
                  await pool.query(`DROP TABLE IF EXISTS "${tableName}";`);
                } catch (dropError) {
                  console.warn(`Failed to drop temporary table ${tableName}:`, dropError);
                }
              }

              // eslint-disable-next-line no-console
              console.log('Cleanup of temporary UUID tables completed.');
            }
          } catch (cleanupError) {
            // Don't fail initialization if cleanup fails, just log it
            console.warn('Failed to cleanup temporary UUID tables:', cleanupError);
          }

          if (READ_STAT_EXTENSION_URL) {
            if (!ALLOW_UNSIGNED_EXTENSIONS) {
              console.error(
                'read_stat extension requires unsigned extensions to be allowed. ' +
                  'Set VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true to enable.',
              );
            } else if (/['";]/.test(READ_STAT_EXTENSION_URL)) {
              console.error(
                'read_stat extension URL contains invalid characters. ' +
                  'URL must not contain single quotes, double quotes, or semicolons.',
              );
            } else {
              try {
                await pool.query(`LOAD '${READ_STAT_EXTENSION_URL}';`);
              } catch (error) {
                console.error(
                  'Failed to load read_stat extension. ' +
                    'Statistical file formats (SAS, SPSS, Stata) will not be available.',
                  error,
                );
              }
            }
          }

          ensureNotCancelled();

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
        if (e instanceof DuckDBInitializationCancelledError) {
          cleanupWorkerResources();
          return null;
        }
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

    connectionPromise.finally(() => {
      if (inFlight.current === connectionPromise) {
        inFlight.current = null;
      }
    });

    return connectionPromise;
  }, [
    persistenceState.dbPath,
    updatePersistenceState,
    normalizedPoolSize,
    memoizedStatusUpdate,
    isTabBlocked,
    cleanupWorkerResources,
  ]);

  useEffect(() => {
    if (!isTabBlocked) {
      return;
    }

    // Increment cancellation token to signal any in-flight initialization to abort.
    // This is safe in JavaScript's single-threaded event loop - no atomicity concerns.
    cancelTokenRef.current += 1;

    // Clear the in-flight promise reference. Any ongoing initialization will
    // detect cancellation via the token check and clean up on its own.
    inFlight.current = null;

    memoizedStatusUpdate({
      state: 'none',
      message: TAB_BLOCKED_STATUS_MESSAGE,
    });

    if (connectionPool) {
      cleanupConnectionResources().catch((error) => {
        console.error('Failed to cleanup connection resources:', error);
      });
    }
  }, [isTabBlocked, connectionPool, cleanupConnectionResources, memoizedStatusUpdate]);

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
