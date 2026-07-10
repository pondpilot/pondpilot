import { showWarning } from '@components/app-notifications';
import { configureConnectionForHttpfs } from '@controllers/db/httpfs-extension-controller';
import * as duckdb from '@duckdb/duckdb-wasm';
import { useDuckDBPersistence } from '@features/duckdb-persistence-context';
import { useTabCoordinationContext } from '@features/tab-coordination-context';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { setCurrentDuckDBConnectionPool } from '@services/duckdb-pool/current-pool';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { markTransient, setAppLoadState, useAppStore } from '@store/app-store';
import {
  buildSearchPathStatement,
  buildUseStatement,
  CatalogSchemaSelection,
} from '@utils/duckdb/identifier';
import { isSafeOpfsPath, normalizeOpfsPath } from '@utils/opfs';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';

import {
  isCoiBundleSelection,
  recommendedThreadCount,
  resolveDuckDBBundles,
  withoutCoiBundle,
} from './duckdb-bundles';
import { isWalReplayFailure, planOpfsDatabaseRegistration } from './opfs-database-files';
import { buildDuckDBWorkerBootstrap } from './worker-log-filter';

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

  const DEFAULT_MAX_POOL_SIZE = 50;
  const normalizedPoolSize = Math.max(5, Math.min(maxPoolSize || DEFAULT_MAX_POOL_SIZE, 100));

  // Get persistence state from context
  const { persistenceState, updatePersistenceState } = useDuckDBPersistence();

  // Use static cdn hosted bundles by default, optionally extended with the
  // multithreaded COI bundle (opt-in; see duckdb-bundles.ts for why). Allow
  // tests/preview builds to point at newer DuckDB-WASM artifacts before an
  // npm package is published.
  const JSDELIVR_BUNDLES = resolveDuckDBBundles(duckdb.getJsDelivrBundles(), {
    mainModule: import.meta.env.VITE_DUCKDB_WASM_MAIN_MODULE,
    mainWorker: import.meta.env.VITE_DUCKDB_WASM_MAIN_WORKER,
    pthreadWorker: import.meta.env.VITE_DUCKDB_WASM_PTHREAD_WORKER,
    forceMvp: import.meta.env.VITE_DUCKDB_WASM_FORCE_MVP === 'true',
    enableCoi: import.meta.env.VITE_DUCKDB_WASM_ENABLE_COI === 'true',
  });

  // create a logger
  //
  // DuckDB-WASM logs one INFO entry per query (ASYNC_DUCKDB/QUERY/RUN). That is
  // useful for tracing but floods the dev console on startup, so it is opt-in:
  // dev defaults to WARNING and only drops to INFO when VITE_DUCKDB_LOG_QUERIES
  // is set. Production is always WARNING.
  const logQueries = import.meta.env.DEV && import.meta.env.VITE_DUCKDB_LOG_QUERIES === 'true';
  const logger = new duckdb.ConsoleLogger(
    logQueries ? duckdb.LogLevel.INFO : duckdb.LogLevel.WARNING,
  );

  // duckdb worker and blob URL references. The pthread worker blob (COI
  // bundle only) must stay alive for the lifetime of the database: Emscripten
  // spawns pthread workers lazily, long after instantiation.
  const worker = useRef<Worker | null>(null);
  const workerBlobUrl = useRef<string | null>(null);
  const pthreadWorkerBlobUrl = useRef<string | null>(null);
  const cancelTokenRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const ALLOW_UNSIGNED_EXTENSIONS =
    import.meta.env.VITE_DUCKDB_ALLOW_UNSIGNED_EXTENSIONS === 'true';
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

  const cleanupWorkerResources = useCallback(() => {
    if (worker.current != null) {
      worker.current.terminate();
      worker.current = null;
    }

    if (workerBlobUrl.current != null) {
      URL.revokeObjectURL(workerBlobUrl.current);
      workerBlobUrl.current = null;
    }

    if (pthreadWorkerBlobUrl.current != null) {
      URL.revokeObjectURL(pthreadWorkerBlobUrl.current);
      pthreadWorkerBlobUrl.current = null;
    }
  }, [worker, workerBlobUrl, pthreadWorkerBlobUrl]);

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
            setCurrentDuckDBConnectionPool(null);
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

        // The boot sequence for one selected bundle: worker creation, WASM
        // instantiation and database open. Extracted so a failed COI
        // (multithreaded) boot can retry with the single-threaded EH bundle.
        // `reportErrors` suppresses terminal error status updates while a
        // fallback attempt remains; console diagnostics are always emitted.
        const bootDatabase = async (
          bundle: duckdb.DuckDBBundle,
          reportErrors: boolean,
        ): Promise<duckdb.AsyncDuckDB> => {
          // Create a blob URL for the worker script. The bootstrap installs a
          // console filter that drops known-noisy MotherDuck wasm_extension logs
          // before loading the real DuckDB worker.
          if (!bundle.mainWorker) {
            throw new Error('Selected DuckDB bundle is missing a worker URL.');
          }
          const worker_url = URL.createObjectURL(
            new Blob([buildDuckDBWorkerBootstrap(bundle.mainWorker)], { type: 'text/javascript' }),
          );

          // Store the URL in the ref for cleanup on unmount
          workerBlobUrl.current = worker_url;

          // The COI bundle's pthread workers are spawned from inside the main
          // DuckDB worker via `new Worker(pthreadWorkerUrl)`. Workers cannot be
          // constructed from a cross-origin CDN URL, so wrap the pthread worker
          // in the same same-origin blob bootstrap as the main worker (this also
          // installs the console filter in every pthread worker).
          let pthreadWorkerUrl: string | null = null;
          if (bundle.pthreadWorker) {
            pthreadWorkerUrl = URL.createObjectURL(
              new Blob([buildDuckDBWorkerBootstrap(bundle.pthreadWorker)], {
                type: 'text/javascript',
              }),
            );
            pthreadWorkerBlobUrl.current = pthreadWorkerUrl;
          }

          // Create worker and database
          let bootedDb: duckdb.AsyncDuckDB;
          try {
            worker.current = new Worker(worker_url);
            bootedDb = new duckdb.AsyncDuckDB(logger, worker.current);
            memoizedStatusUpdate({
              state: 'loading',
              message: 'Loading DuckDB... 0%',
            });
          } catch (e: any) {
            const errorMessage = `Error setting up DuckDB worker: ${e.toString()}`;
            console.error(errorMessage);
            if (reportErrors) {
              memoizedStatusUpdate({
                state: 'error',
                message: import.meta.env.DEV
                  ? errorMessage
                  : 'Failed to initialize database worker',
              });
            }
            throw e; // Rethrow to trigger error handler
          }

          ensureNotCancelled();

          // Instantiate DuckDB
          try {
            await bootedDb.instantiate(
              bundle.mainModule,
              pthreadWorkerUrl,
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
            if (reportErrors) {
              memoizedStatusUpdate({
                state: 'error',
                message: import.meta.env.DEV ? errorMessage : 'Failed to initialize database',
              });
            }
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

            // Direct `opfs://` opens are not durable on the current
            // duckdb-wasm version (upstream #2192) — register the OPFS file
            // handles ourselves and open by registered name instead. See
            // opfs-database-files.ts for the full background.
            const registrationPlan = planOpfsDatabaseRegistration(dbPath);
            if (!registrationPlan) {
              console.warn(
                `OPFS database path ${dbPath} is not eligible for direct file registration; ` +
                  'falling back to opfs:// path handling, which is NOT durable on the current DuckDB-WASM version.',
              );
            }

            // Log the path for debugging
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(
                'Opening DuckDB with path:',
                dbPath,
                registrationPlan ? `(registered as ${registrationPlan.registeredDbPath})` : '',
              );
            }

            const openConfig: duckdb.DuckDBConfig = {
              path: registrationPlan ? registrationPlan.registeredDbPath : dbPath,
              accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
              allowUnsignedExtensions: ALLOW_UNSIGNED_EXTENSIONS,
              // Required with registered OPFS handles so a fresh, empty file
              // is treated as a new database instead of failing validation.
              ...(registrationPlan ? { useDirectIO: true } : {}),
              // Multithreaded (COI) engine only: DuckDB-WASM defaults to 4
              // threads regardless of available cores.
              ...(bundle.pthreadWorker
                ? { maximumThreads: recommendedThreadCount(navigator.hardwareConcurrency) }
                : {}),
              query: {
                // Enable Apache Arrow type and value patching DECIMAL -> DOUBLE on query materialization
                // https://github.com/apache/arrow/issues/37920
                castDecimalToDouble: true,
              },
            };

            // A previous DuckDB worker (bundle-fallback retry, remount, or a
            // just-closed tab) may still hold the OPFS sync access handle —
            // Chromium releases a terminated worker's handles asynchronously.
            // Retry this specific contention briefly instead of failing.
            const OPEN_LOCK_RETRIES = 10;
            const OPEN_LOCK_RETRY_DELAY_MS = 300;
            for (let attempt = 1; ; attempt += 1) {
              try {
                if (registrationPlan) {
                  const opfsRoot = await navigator.storage.getDirectory();
                  const [dbFile, ...companionFiles] = registrationPlan.files;
                  const dbFileHandle = await opfsRoot.getFileHandle(dbFile.opfsFileName, {
                    create: true,
                  });
                  // Reset the WAL and checkpoint companions before every open.
                  // DuckDB deletes the WAL file after a checkpoint, but the
                  // WASM runtime's removeFile is a no-op — stale WAL
                  // generations accumulate and a later open can abort with
                  // "Invalid WAL entry type" while replaying the garbage tail
                  // (or, for files from the broken opfs:// era, resurrect
                  // ghost tables). WAL replay does not work in DuckDB-WASM
                  // OPFS anyway (verified back to 1.33.1-dev20.0), so a
                  // session always resumes from the last checkpoint.
                  for (const companion of companionFiles) {
                    await opfsRoot.removeEntry(companion.opfsFileName).catch(() => {});
                  }
                  await bootedDb.registerFileHandle(
                    dbFile.registeredName,
                    dbFileHandle,
                    duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
                    true,
                  );
                  for (const companion of companionFiles) {
                    const companionHandle = await opfsRoot.getFileHandle(companion.opfsFileName, {
                      create: true,
                    });
                    await bootedDb.registerFileHandle(
                      companion.registeredName,
                      companionHandle,
                      duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
                      true,
                    );
                  }
                }
                await bootedDb.open(openConfig);
                break;
              } catch (e: any) {
                const message = e instanceof Error ? e.message : String(e);
                const isHandleContention = /Access Handles cannot be created/i.test(message);
                // Backstop for WAL states the pre-open reset cannot fix in
                // place (e.g. the engine buffered the corrupt WAL before
                // failing): drop and retry — the next attempt starts from
                // freshly reset companions.
                const isWalFailure = registrationPlan != null && isWalReplayFailure(message);
                if ((!isHandleContention && !isWalFailure) || attempt >= OPEN_LOCK_RETRIES) {
                  throw e;
                }
                if (isWalFailure) {
                  console.warn(
                    'DuckDB WAL was invalid and has been discarded; the database resumes from its last checkpoint.',
                  );
                }
                // Release any partially-acquired handles from this attempt so
                // the retry does not contend with itself.
                await bootedDb.dropFiles().catch(() => {});
                await new Promise((resolve) => {
                  setTimeout(resolve, OPEN_LOCK_RETRY_DELAY_MS);
                });
                ensureNotCancelled();
              }
            }
          } catch (e: any) {
            // Handle connection error - no fallback to in-memory mode
            const errorMessage = `Error opening persistent database: ${e.toString()}`;
            console.error(errorMessage);
            if (reportErrors) {
              memoizedStatusUpdate({
                state: 'error',
                message: import.meta.env.DEV ? errorMessage : 'Failed to open persistent database',
              });
            }
            throw e; // Rethrow to trigger error handler
          }

          return bootedDb;
        };

        // Resolve bundle — selectBundle prefers the multithreaded COI build
        // when the page is cross-origin isolated and the browser supports WASM
        // threads, exceptions and SIMD; otherwise it picks EH, then MVP.
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        ensureNotCancelled();

        // Establishes a usable pool for one bundle: full database boot plus
        // pool construction and the first (write-mode) queries. Grouped into
        // one retryable unit because per-connection extension loading (httpfs)
        // runs on first pool use — under COI a broken threaded extension build
        // only surfaces there, after a successful boot.
        const establishPool = async (
          bootBundle: duckdb.DuckDBBundle,
          reportErrors: boolean,
        ): Promise<AsyncDuckDBConnectionPool> => {
          const bootedDb = await bootDatabase(bootBundle, reportErrors);

          ensureNotCancelled();

          let bootedPool: AsyncDuckDBConnectionPool | null = null;
          try {
            // Create a connection pool with the update state callback (always persistent)
            memoizedStatusUpdate({
              state: 'loading',
              message: 'Initializing connection pool...',
            });

            // Create a connection pool with configurable checkpoint settings
            bootedPool = new AsyncDuckDBConnectionPool(
              bootedDb,
              normalizedPoolSize,
              updatePersistenceState, // Always use the persistence callback
              {
                // Default configuration that balances performance and data safety
                throttleMs: import.meta.env.DEV ? 5000 : 10000, // More frequent in dev, less in prod
                maxChangesBeforeForce: 100,
                checkpointOnClose: true,
                // Only log checkpoints in development mode
                logCheckpoints: import.meta.env.DEV,
                // Always checkpoint the persistent database by name: pooled
                // connections may sit on another catalog (MotherDuck flows
                // reset theirs to `USE memory`), and a bare FORCE CHECKPOINT
                // would silently no-op for the persistent database.
                checkpointDatabase: PERSISTENT_DB_NAME,
              },
              async (conn) => {
                await configureConnectionForHttpfs(conn);
                try {
                  await conn.query("ATTACH IF NOT EXISTS ':memory:' AS memory;");
                } catch (error) {
                  console.warn('Failed to attach per-connection memory catalog:', error);
                }
              },
              {
                onBeforeTabConnectionUse: async (tabId, conn) => {
                  const tab = useAppStore.getState().tabs.get(tabId);
                  if (tab?.type !== 'script') return;

                  const session = useAppStore.getState().sqlScriptSessions.get(tab.sqlScriptId);
                  const next: CatalogSchemaSelection = session
                    ? {
                        catalog: session.currentCatalog,
                        schema: session.currentSchema,
                        searchPath: session.searchPath ?? null,
                      }
                    : {
                        catalog: PERSISTENT_DB_NAME,
                        schema: 'main',
                        searchPath: null,
                      };

                  const useStmt = buildUseStatement(next.catalog, next.schema);
                  if (useStmt) {
                    try {
                      await conn.query(useStmt);
                    } catch (error) {
                      throw new Error(
                        `Failed to restore DuckDB script session (${next.catalog ?? 'default'}${
                          next.schema ? `.${next.schema}` : ''
                        }). Select another session or reconnect the data source before running.`,
                        { cause: error },
                      );
                    }
                  }
                  // Restore a multi-entry search_path captured after the run.
                  // USE collapses the path to a single schema, so re-apply the
                  // full path on top. Best-effort: a value DuckDB can't round-
                  // trip must not abort the run — we keep the single schema USE
                  // already set.
                  const searchPathStmt = buildSearchPathStatement(next.searchPath);
                  if (searchPathStmt) {
                    try {
                      await conn.query(searchPathStmt);
                    } catch (error) {
                      console.warn(
                        'Failed to restore DuckDB search_path for script session:',
                        error,
                      );
                    }
                  }

                  // Note: the transient flag is intentionally NOT cleared here.
                  // This hook fires on every connection claim, including the
                  // background re-read that happens when a user switches to an
                  // evicted tab. Clearing it here would hide the "session
                  // evicted" badge the instant the tab is viewed. The badge is
                  // cleared at the start of the next run instead (see
                  // script-tab-view), matching the eviction notice that catalog
                  // and schema are restored on the next run.
                },
                onTabEvicted: (tabId) => {
                  const tab = useAppStore.getState().tabs.get(tabId);
                  if (tab?.type !== 'script') return;

                  markTransient(tab.sqlScriptId, true);
                  showWarning({
                    id: `duckdb-session-evicted-${tabId}`,
                    title: 'Script session evicted',
                    message:
                      'This tab was inactive long enough for DuckDB to reuse its connection. Catalog and schema will be restored on the next run, but temp tables and SET values are not preserved.',
                  });
                },
              },
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
            await bootedPool.query(`CREATE OR REPLACE TABLE "${name}" as select 1;`);
            await bootedPool.query(`DROP TABLE "${name}";`);

            return bootedPool;
          } catch (e: any) {
            // Stop the pool's checkpoint timers before the worker goes away.
            try {
              await bootedPool?.close();
            } catch {
              // best-effort cleanup of a half-initialized pool
            }
            const errorMessage = `Error getting DuckDB connection: ${e.toString()}`;
            console.error(errorMessage);
            if (reportErrors) {
              memoizedStatusUpdate({
                state: 'error',
                message: import.meta.env.DEV
                  ? errorMessage
                  : 'Failed to initialize connection pool',
              });
            }
            throw e; // Rethrow to trigger error handler
          }
        };

        const usingCoi = isCoiBundleSelection(bundle, JSDELIVR_BUNDLES);
        let pool: AsyncDuckDBConnectionPool;
        try {
          pool = await establishPool(bundle, !usingCoi);
          if (usingCoi) {
            // eslint-disable-next-line no-console
            console.info(
              `DuckDB-WASM running multithreaded (COI bundle, up to ${recommendedThreadCount(
                navigator.hardwareConcurrency,
              )} threads)`,
            );
          }
        } catch (e) {
          // A COI initialization can fail for reasons the EH bundle does not
          // share (pthread spawning, OPFS with threads, threaded extension
          // builds), so retry once single-threaded rather than failing the app.
          if (e instanceof DuckDBInitializationCancelledError || !usingCoi) {
            throw e;
          }
          console.warn(
            'Multithreaded DuckDB (COI) initialization failed; retrying with the single-threaded EH bundle:',
            e,
          );
          cleanupWorkerResources();
          const fallbackBundle = await duckdb.selectBundle(withoutCoiBundle(JSDELIVR_BUNDLES));
          ensureNotCancelled();
          pool = await establishPool(fallbackBundle, true);
        }

        ensureNotCancelled();

        // Finally, finish initialization: leftover cleanup, optional
        // extensions, and publishing the pool to the app.
        try {
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
          setCurrentDuckDBConnectionPool(pool);
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

  // Flush pending changes to OPFS when the page is being hidden or unloaded
  // (refresh, navigation, tab close/switch). DuckDB-WASM does not replay the
  // OPFS WAL on the next load, so anything not yet checkpointed at unload
  // would be lost; this best-effort flush closes most of that window.
  useEffect(() => {
    if (!connectionPool) {
      return undefined;
    }

    const flush = () => {
      connectionPool.flushPendingChanges().catch((error) => {
        console.warn('Failed to flush pending DuckDB changes on page hide:', error);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [connectionPool]);

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
