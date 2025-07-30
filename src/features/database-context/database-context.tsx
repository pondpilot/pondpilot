import { DatabaseEngineFactory } from '@engines/database-engine-factory';
import { DatabaseEngine, ConnectionPool, EngineConfig } from '@engines/types';
import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import { isSafeOpfsPath, normalizeOpfsPath } from '@utils/opfs';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Context types
type DatabaseInitState = 'none' | 'loading' | 'ready' | 'error';

type DatabaseInitializerStatusContextType = {
  state: DatabaseInitState;
  message: string;
};

type DatabaseInitializerContextType = () => Promise<ConnectionPool | null>;

// Status context
export const DatabaseInitializerStatusContext =
  createContext<DatabaseInitializerStatusContextType | null>(null);

export const useDatabaseInitializerStatus = (): DatabaseInitializerStatusContextType =>
  useContext(DatabaseInitializerStatusContext)!;

// Initializer context
export const DatabaseInitializerContext = createContext<DatabaseInitializerContextType | null>(
  null,
);

export const useDatabaseInitializer = (): DatabaseInitializerContextType =>
  useContext(DatabaseInitializerContext)!;

// Connection pool context
export const DatabaseConnPoolContext = createContext<ConnectionPool | null>(null);

export const useInitializedDatabaseConnectionPool = (): ConnectionPool => {
  const pool = useContext(DatabaseConnPoolContext);

  if (!pool) {
    throw new Error(
      "`useInitializedDatabaseConnectionPool` should not be used unless app state is `ready`. Database initialization failed or hasn't finished yet.",
    );
  }

  return pool;
};

export const useDatabaseConnectionPool = (): ConnectionPool | null =>
  useContext(DatabaseConnPoolContext);

interface DatabaseConnectionPoolProviderProps {
  maxPoolSize: number;
  children: React.ReactNode;
  engineConfig?: EngineConfig;
  onStatusUpdate?: (status: { state: DatabaseInitState; message: string }) => void;
}

export const DatabaseConnectionPoolProvider = ({
  maxPoolSize,
  children,
  engineConfig,
  onStatusUpdate,
}: DatabaseConnectionPoolProviderProps) => {
  const [initStatus, setInitStatus] = useState<DatabaseInitializerStatusContextType>({
    state: 'none',
    message: "Database initialization hasn't started yet",
  });

  const [connectionPool, setConnectionPool] = useState<ConnectionPool | null>(null);
  const [engine, setEngine] = useState<DatabaseEngine | null>(null);

  const DEFAULT_MAX_POOL_SIZE = 30;
  const normalizedPoolSize = Math.max(5, Math.min(maxPoolSize || DEFAULT_MAX_POOL_SIZE, 50));

  // Get persistence state from context
  const { persistenceState, updatePersistenceState } = useDuckDBPersistence();

  // Single reference for in-flight promise
  const inFlight = useRef<Promise<ConnectionPool | null> | null>(null);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (engine) {
        engine.shutdown();
      }
    },
    [engine],
  );

  // Memoize the status update function
  const memoizedStatusUpdate = useCallback(
    (status: { state: DatabaseInitState; message: string }) => {
      setInitStatus(status);
      onStatusUpdate?.(status);
    },
    [onStatusUpdate],
  );

  const connectDatabase = useCallback(async (): Promise<ConnectionPool | null> => {
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

    const connectionPromise = (async (): Promise<ConnectionPool | null> => {
      try {
        memoizedStatusUpdate({
          state: 'loading',
          message: 'Starting database engine...',
        });

        // Determine engine configuration
        const config: EngineConfig = engineConfig || {
          type: 'duckdb-wasm',
          storageType: 'persistent',
          storagePath: persistenceState.dbPath,
          extensions: ['httpfs'],
          poolSize: normalizedPoolSize,
        };

        // Ensure proper OPFS path format for WASM engine
        if (config.type === 'duckdb-wasm' && config.storageType === 'persistent') {
          let dbPath = config.storagePath || persistenceState.dbPath;

          // Make sure the path starts with opfs://
          if (!dbPath.startsWith('opfs://')) {
            dbPath = `opfs://${dbPath.replace(/^opfs:/, '')}`;
          }

          // Validate the path
          if (!isSafeOpfsPath(dbPath)) {
            const normalizedPath = normalizeOpfsPath(dbPath);
            throw new Error(
              import.meta.env.DEV
                ? `Invalid or unsafe database path: ${normalizedPath}`
                : 'Invalid database configuration',
            );
          }

          config.storagePath = dbPath;
        }

        memoizedStatusUpdate({
          state: 'loading',
          message: 'Creating database engine...',
        });

        // Create the engine
        const newEngine = await DatabaseEngineFactory.createEngine(config);
        setEngine(newEngine);

        memoizedStatusUpdate({
          state: 'loading',
          message: 'Creating connection pool...',
        });

        // Create connection pool
        const pool = await newEngine.createConnectionPool(normalizedPoolSize);

        // If this is an abstracted AsyncDuckDBConnectionPool, set up checkpointing
        if (config.type === 'duckdb-wasm' && updatePersistenceState) {
          // The pool returned is our abstraction, but we need to handle checkpointing
          // This would be better handled inside the engine itself
          // For now, we'll use a wrapper approach
          const originalQuery = pool.acquire.bind(pool);
          let changeCount = 0;

          pool.acquire = async () => {
            const conn = await originalQuery();
            // Wrap execute to track changes
            const originalExecute = conn.execute.bind(conn);
            conn.execute = async (sql: string, params?: any[]) => {
              const result = await originalExecute(sql, params);

              // Check if this was a write operation
              const trimmedSql = sql.trim().toUpperCase();
              if (
                trimmedSql.startsWith('CREATE') ||
                trimmedSql.startsWith('INSERT') ||
                trimmedSql.startsWith('UPDATE') ||
                trimmedSql.startsWith('DELETE') ||
                trimmedSql.startsWith('DROP') ||
                trimmedSql.startsWith('ALTER')
              ) {
                changeCount += 1;

                // Checkpoint after certain number of changes
                if (changeCount >= 100) {
                  try {
                    await newEngine.checkpoint();
                    await updatePersistenceState();
                    changeCount = 0;
                  } catch (e) {
                    console.warn('Failed to checkpoint:', e);
                  }
                }
              }

              return result;
            };

            return conn;
          };
        }

        setConnectionPool(pool);

        memoizedStatusUpdate({
          state: 'ready',
          message: `Database ready with ${config.type}!`,
        });

        // Initial state update for persistence
        if (updatePersistenceState) {
          await updatePersistenceState();
        }

        return pool;
      } catch (e: any) {
        console.error('Database initialization error:', e);
        memoizedStatusUpdate({
          state: 'error',
          message: import.meta.env.DEV
            ? `Database initialization failed: ${e.toString()}`
            : 'Failed to initialize database',
        });
        return null;
      }
    })();

    inFlight.current = connectionPromise;

    connectionPromise.catch(() => {
      inFlight.current = null;
    });

    return connectionPromise;
  }, [
    persistenceState?.dbPath,
    updatePersistenceState,
    normalizedPoolSize,
    memoizedStatusUpdate,
    engineConfig,
  ]);

  return (
    <DatabaseInitializerStatusContext.Provider value={initStatus}>
      <DatabaseInitializerContext.Provider value={connectDatabase}>
        <DatabaseConnPoolContext.Provider value={connectionPool}>
          {children}
        </DatabaseConnPoolContext.Provider>
      </DatabaseInitializerContext.Provider>
    </DatabaseInitializerStatusContext.Provider>
  );
};
