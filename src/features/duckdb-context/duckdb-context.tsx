import * as duckdb from '@duckdb/duckdb-wasm';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Context used to provide progress of duckdb initialization
type duckDBInitState = 'none' | 'loading' | 'ready' | 'error';
type duckDBInitializerContextType = {
  state: duckDBInitState;
  message: string;
  connectDuckDb: () => Promise<duckdb.AsyncDuckDBConnection | null>;
};

export type duckDBConnectionContextType = {
  db: duckdb.AsyncDuckDB | null;
  conn: duckdb.AsyncDuckDBConnection | null;
};

export type duckDBInitializedConnectionType = {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
};

export const duckDBInitializerContext = createContext<duckDBInitializerContextType | null>(null);
export const useDuckDBInitializer = (): duckDBInitializerContextType =>
  useContext(duckDBInitializerContext)!;

export const duckDBConnContext = createContext<duckDBConnectionContextType | null>(null);

/**
 * A hook to get the DuckDB connection and database instance after initialization.
 *
 * To get the connection and database at any time, use `useDuckDBConnection` instead.
 *
 * @throws Error if the context is not available or if the connection and database are not initialized.
 * @returns DuckDB connection and database instance
 */
export const useInitializedDuckDBConnection = (): duckDBInitializedConnectionType => {
  const context = useContext(duckDBConnContext);

  if (!context || !context.conn || !context.db) {
    throw new Error(
      "useDuckDBConnection should not be used, unless app state is `ready`. Database initialization failed or haven't finished yet.",
    );
  }

  return {
    db: context.db,
    conn: context.conn,
  };
};

export const useDuckDBConnection = (): duckDBConnectionContextType =>
  useContext(duckDBConnContext)!;

export const DuckDBConnectionProvider = ({ children }: { children: React.ReactNode }) => {
  const [initState, setInitState] = useState<{
    state: duckDBInitState;
    message: string;
  }>({
    state: 'none',
    message: "DuckDB initialization hasn't started yet",
  });

  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [conn, setConn] = useState<duckdb.AsyncDuckDBConnection | null>(null);

  // Use static cdn hosted bundles
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  // create a logger
  const logger = new duckdb.ConsoleLogger(
    import.meta.env.DEV ? duckdb.LogLevel.INFO : duckdb.LogLevel.WARNING,
  );

  // duckdb worker
  const worker = useRef<Worker | null>(null);

  // terminate worker on unmount
  useEffect(
    () => () => {
      if (worker.current != null) {
        worker.current.terminate();
        worker.current = null;
      }
    },
    [],
  );

  const inFlight = useRef<Promise<duckdb.AsyncDuckDBConnection | null> | null>(null);

  const connect = useCallback(async (): Promise<duckdb.AsyncDuckDBConnection | null> => {
    // This is the inverse of creating a function on first call. Saves indentation
    if (inFlight.current) return inFlight.current;

    inFlight.current = (async (): Promise<duckdb.AsyncDuckDBConnection | null> => {
      // Set the state to loading
      setInitState({
        state: 'loading',
        message: 'Starting DuckDB worker...',
      });

      // Resolve bundle
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
      );

      // Create worker and database
      let newDb: duckdb.AsyncDuckDB;
      try {
        worker.current = new Worker(worker_url);
        newDb = new duckdb.AsyncDuckDB(logger, worker.current);
        setDb(newDb);
        setInitState({
          state: 'loading',
          message: 'Loading DuckDB... 0%',
        });
      } catch (e: any) {
        setInitState({
          state: 'error',
          message: `Error setting up DuckDB worker: ${e.toString()}`,
        });
        return null;
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
                setInitState({
                  state: 'loading',
                  message: `Loading DuckDB... ${progress}%`,
                });
              } catch (e: any) {
                console.warn(`progress handler failed with error: ${e.toString()}`);
              }
            } else {
              setInitState({
                state: 'loading',
                message: 'Loading DuckDB...',
              });
            }
          },
        );
      } catch (e: any) {
        setInitState({
          state: 'error',
          message: `Error instantiating DuckDB: ${e.toString()}`,
        });
        return null;
      }

      // Open a database
      try {
        await newDb.open({
          query: {
            // Enable Apache Arrow type and value patching DECIMAL -> DOUBLE on query materialization
            // https://github.com/apache/arrow/issues/37920
            castDecimalToDouble: true,
          },
        });
      } catch (e: any) {
        setInitState({
          state: 'error',
          message: `Error opening DuckDB connection: ${e.toString()}`,
        });
        return null;
      }

      // Finally, get the connection
      try {
        const connection = await newDb.connect();
        setConn(connection);
        setInitState({ state: 'ready', message: 'DuckDB is ready!' });
        return connection;
      } catch (e: any) {
        setInitState({
          state: 'error',
          message: `Error getting DuckDB connection: ${e.toString()}`,
        });
        return null;
      }
    })();

    return inFlight.current;
  }, []);

  const initValue = {
    state: initState.state,
    message: initState.message,
    connectDuckDb: connect,
  };

  const dbConnValue = {
    db,
    conn,
  };

  return (
    <duckDBInitializerContext.Provider value={initValue}>
      <duckDBConnContext.Provider value={dbConnValue}>{children}</duckDBConnContext.Provider>
    </duckDBInitializerContext.Provider>
  );
};
