/**
 * MotherDuck Utilities
 *
 * Manages the lifecycle of MotherDuck cloud database connections:
 * extension loading, authentication, database discovery, and disconnection.
 *
 * The motherduck extension is loaded dynamically from ext.motherduck.com.
 * It requires SharedArrayBuffer (COOP/COEP headers) and unsigned extensions.
 */

import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { deleteTab } from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { MotherDuckConnection, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel, DBColumn, DBSchema, DBTableOrView } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { AppIdbSchema } from '@models/persisted-store';
import { TabId } from '@models/tab';
import { getSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { formatMotherDuckDbKey, isMotherDuckDbKey } from '@utils/data-source';
import { getTableColumnId } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import { IDBPDatabase } from 'idb';

/** MotherDuck extension version API endpoint. */
const MD_EXTENSION_VERSION_URL = 'https://api.motherduck.com/extension_version';

/**
 * A target for MotherDuck SQL: either the pool or a single pooled connection.
 *
 * MotherDuck setup is connection-local — `SET motherduck_token`, the `ATTACH 'md:'`
 * handshake (which auto-attaches the user's databases on THAT connection), and
 * `USE <db>` for metadata — so a connect/discover/metadata sequence MUST run on
 * one connection. The pool spreads `pool.query()` calls across connections, so
 * callers pass a single pooled connection acquired via `withMotherDuckConnection`.
 */
type MotherDuckQueryable = Pick<AsyncDuckDBConnectionPool, 'query'>;

async function resetMotherDuckConnectionCatalog(conn: MotherDuckQueryable): Promise<void> {
  try {
    await conn.query('USE memory;');
    return;
  } catch {
    // Fall back to the persistent catalog below.
  }

  try {
    await conn.query(`USE ${toDuckDBIdentifier(PERSISTENT_DB_NAME)};`);
  } catch (error) {
    console.warn('Failed to reset MotherDuck pooled connection catalog:', error);
  }
}

/**
 * Acquire a single pooled connection, run `fn` against it, then release it.
 * Use this to wrap any MotherDuck sequence that depends on connection-local
 * state (token, `ATTACH 'md:'`, `USE`). Running such a sequence directly on the
 * pool spreads it across connections and loses the state — e.g.
 * `listMotherDuckDatabases` would not see the databases the handshake attached.
 *
 * This MUST NOT detach the shared `memory` catalog. All pooled connections share
 * one DuckDB-WASM instance, so ATTACH/DETACH is catalog-global: detaching
 * `memory` removes it for every connection, not just this one. `memory` is the
 * default database of the other pooled connections, so detaching it for the
 * duration of the MotherDuck handshake (seconds, including network retries)
 * makes their in-flight queries fail with "There must be at least one attached
 * databases!" — which surfaces as every tab failing to open a reader while a
 * MotherDuck connection reconnects on startup.
 *
 * The handshake does not need `memory` gone: `ATTACH 'md:'` still attaches
 * `md_information_schema`, and discovery is explicit — `attachAllMotherDuckDatabases`
 * enumerates `md_information_schema.databases` and `ATTACH`es each account
 * database by name, which works with `memory` attached.
 */
export async function withMotherDuckConnection<T>(
  pool: AsyncDuckDBConnectionPool,
  fn: (conn: MotherDuckQueryable) => Promise<T>,
): Promise<T> {
  const conn = await pool.getBackgroundConnection();
  try {
    return await fn(conn);
  } finally {
    await resetMotherDuckConnectionCatalog(conn);
    await conn.close();
  }
}

/**
 * Returns the DuckDB core version (e.g. "v1.5.1") by querying the running engine.
 * This keeps the MotherDuck API header in sync when the @duckdb/duckdb-wasm package is upgraded.
 */
async function getDuckDBVersion(pool: MotherDuckQueryable): Promise<string> {
  const result = await pool.query('SELECT version() AS v');
  const version: string = result.toArray()[0]?.v;
  if (!version) {
    throw new Error('Could not determine DuckDB version from SELECT version()');
  }
  return version;
}

/**
 * Resolves the MotherDuck token from the encrypted secret store.
 * Returns the token string, or null if the secret is missing or unrecoverable.
 */
export async function resolveMotherDuckToken(
  iDb: IDBPDatabase<AppIdbSchema>,
  connection: MotherDuckConnection,
): Promise<string | null> {
  if (!connection.secretRef) return null;

  const secret = await getSecret(iDb, connection.secretRef);
  return secret?.data?.token ?? null;
}

/**
 * Checks whether the motherduck extension is already loaded.
 */
export async function isMotherDuckExtensionLoaded(pool: MotherDuckQueryable): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT extension_name FROM duckdb_extensions() WHERE extension_name = 'motherduck' AND loaded = true",
    );
    return result.numRows > 0;
  } catch (error) {
    console.warn('Failed to check MotherDuck extension status:', error);
    return false;
  }
}

/** Timeout for the extension version API request (ms). */
const MD_FETCH_TIMEOUT_MS = 15_000;

/**
 * Loads the motherduck extension. Idempotent — no-op if already loaded.
 *
 * Fetches the extension version from the MotherDuck API, sets the custom
 * extension repository, loads the extension, and resets the repository.
 *
 * Requires SharedArrayBuffer (COOP/COEP headers must be set).
 * Throws on failure.
 */
export async function loadMotherDuckExtension(pool: MotherDuckQueryable): Promise<void> {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'MotherDuck requires SharedArrayBuffer. Ensure Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers are configured.',
    );
  }

  if (await isMotherDuckExtensionLoaded(pool)) {
    return;
  }

  const duckdbVersion = await getDuckDBVersion(pool);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MD_FETCH_TIMEOUT_MS);

  let versionResponse: Response;
  try {
    versionResponse = await fetch(MD_EXTENSION_VERSION_URL, {
      headers: { 'x-md-duckdb-version': duckdbVersion },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'MotherDuck extension version request timed out. Please check your network connection.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!versionResponse.ok) {
    throw new Error(
      `Failed to fetch MotherDuck extension version: ${versionResponse.status} ${versionResponse.statusText}`,
    );
  }

  const { extensionVersion } = await versionResponse.json();

  // Validate the version format to prevent malformed URLs
  if (typeof extensionVersion !== 'string' || !/^v?\d+\.\d+\.\d+/.test(extensionVersion)) {
    throw new Error(`Unexpected MotherDuck extension version format: ${String(extensionVersion)}`);
  }

  const repo = `https://ext.motherduck.com/${extensionVersion}`;
  const safeRepo = escapeSqlStringValue(repo);

  await pool.query(`SET custom_extension_repository='${safeRepo}';`);
  try {
    await pool.query('LOAD motherduck;');
  } finally {
    await pool.query('RESET custom_extension_repository;');
  }
}

/**
 * Authenticates with MotherDuck using the provided token.
 * The extension must be loaded before calling this.
 *
 * Sets the token credential, then runs ATTACH 'md:' to initiate the
 * actual connection handshake and auto-discover the user's databases.
 *
 * Throws on failure.
 */
export async function connectMotherDuck(pool: MotherDuckQueryable, token: string): Promise<void> {
  // Set the token — configures the credential for the MotherDuck extension.
  // DuckDB-WASM does not support parameterized SET statements, so we inline
  // the token as a string literal with single-quote escaping. The pool.query
  // API executes a single statement, so semicolons in the value cannot cause
  // statement multiplexing.
  //
  // motherduck_token is an initialization-only setting: once set, it cannot be
  // changed for the lifetime of the engine instance. If the token was already
  // configured (e.g. by a preceding test-connection), the SET will fail.
  // In that case we proceed to ATTACH, which will validate the token.
  try {
    await pool.query(`SET motherduck_token='${escapeSqlStringValue(token)}';`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('can only be set during initialization')) {
      throw error;
    }
  }

  // Attach MotherDuck — this triggers the connection handshake
  // and auto-discovers the user's databases.
  //
  // The WASM network layer initializes asynchronously after the extension loads.
  // The first ATTACH attempt often fails with "Network is not ready yet" because
  // the WebSocket transport hasn't finished setup. Retry with exponential backoff.
  const retryDelaysMs = [1500, 3000, 6000];

  for (let attempt = 1; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      await pool.query("ATTACH IF NOT EXISTS 'md:'");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // If databases are already attached (e.g. from a preceding test-connection),
      // the connection is already live — treat as success.
      if (message.includes('already attached')) {
        return;
      }

      const isNetworkNotReady = message.includes('Network is not ready');

      if (!isNetworkNotReady || attempt === retryDelaysMs.length) {
        throw error;
      }

      const delayMs = retryDelaysMs[attempt - 1];
      console.warn(
        `MotherDuck ATTACH attempt ${attempt}/${retryDelaysMs.length} failed (network not ready), retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Lists MotherDuck databases currently visible in the DuckDB catalog.
 * MotherDuck databases have type='motherduck' in duckdb_databases().
 * Their names are plain (e.g. 'my_db'), not prefixed with 'md:'.
 */
export async function listMotherDuckDatabases(
  pool: MotherDuckQueryable,
): Promise<{ name: string; type: string }[]> {
  const result = await pool.query(
    "SELECT database_name, type FROM duckdb_databases() WHERE type = 'motherduck'",
  );
  return result.toArray().map((row: any) => ({
    name: row.database_name,
    type: row.type,
  }));
}

/**
 * Enumerate every database in the connected MotherDuck account and attach each.
 *
 * `ATTACH 'md:'` only auto-attaches the account's default database, so the rest
 * stay invisible to `duckdb_databases()`. `md_information_schema.databases`
 * lists them all; we attach any that aren't already attached so their schemas
 * become queryable for metadata. Returns the full set of database names.
 *
 * Must run on a connection that has completed the `ATTACH 'md:'` handshake (so
 * `md_information_schema` is present). Falls back to the currently attached set
 * if the catalog can't be read.
 */
export async function attachAllMotherDuckDatabases(conn: MotherDuckQueryable): Promise<string[]> {
  let names: string[];
  try {
    const result = await conn.query('SELECT name FROM md_information_schema.databases');
    names = result
      .toArray()
      .map((row: any) => row.name as string)
      .filter((name) => Boolean(name) && name !== 'md_information_schema');
  } catch (error) {
    console.warn('Failed to enumerate MotherDuck databases; using attached set:', error);
    return (await listMotherDuckDatabases(conn)).map((db) => db.name);
  }

  for (const name of names) {
    try {
      await conn.query(`ATTACH IF NOT EXISTS 'md:${escapeSqlStringValue(name)}'`);
    } catch (error) {
      console.warn(`Failed to attach MotherDuck database '${name}':`, error);
    }
  }
  return names;
}

export function registerMotherDuckDatabaseAttaches(
  pool: AsyncDuckDBConnectionPool,
  dbNames: string[],
): void {
  pool.registerGlobalAttach('md:', "ATTACH IF NOT EXISTS 'md:'");

  for (const dbName of dbNames) {
    if (!dbName || dbName === 'md_information_schema') continue;
    pool.registerGlobalAttach(dbName, `ATTACH IF NOT EXISTS 'md:${escapeSqlStringValue(dbName)}'`);
  }
}

/**
 * Loads schema metadata for MotherDuck databases.
 *
 * MotherDuck's remote catalogs don't support three-part name resolution
 * (e.g. `my_db.information_schema.columns` fails). To work around this,
 * we switch the active database with `USE`, query `information_schema`
 * which resolves relative to the current database, then switch back.
 *
 * CONCURRENCY NOTE: This function uses `USE <db>` to switch the active
 * database context. This is safe because AsyncDuckDBConnectionPool serializes
 * all queries through a single DuckDB-WASM worker. If the pool ever supports
 * parallel query execution, this approach will need to be revisited (e.g.
 * using dedicated connections or fully qualified catalog queries).
 *
 * Results are stored under 'md:' prefixed keys (e.g. 'md:my_db') to avoid
 * collisions with local databases and to let the tree builder identify them.
 */
export async function getMotherDuckDatabaseModel(
  pool: MotherDuckQueryable,
  dbNames: string[],
): Promise<Map<string, DataBaseModel>> {
  const result = new Map<string, DataBaseModel>();
  if (dbNames.length === 0) return result;

  // Remember the current database so we can switch back
  let originalDb = 'pondpilot';
  try {
    const dbResult = await pool.query('SELECT current_database() AS db');
    originalDb = dbResult.toArray()[0]?.db ?? 'pondpilot';
  } catch (error) {
    console.warn('Failed to determine current database, falling back to default:', error);
  }

  for (const dbName of dbNames) {
    try {
      // Switch to the MotherDuck database
      await pool.query(`USE ${toDuckDBIdentifier(dbName)}`);

      // Query information_schema — resolves to the current (MotherDuck) database.
      // MotherDuck's shared catalog exposes all databases in information_schema,
      // so we filter by table_catalog to get only the current database's objects.
      const quotedDbName = escapeSqlStringValue(dbName);
      const sql = `
        SELECT
          c.table_schema,
          c.table_name,
          t.table_type,
          c.column_name,
          c.ordinal_position,
          c.data_type,
          c.is_nullable
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON c.table_catalog = t.table_catalog
          AND c.table_schema = t.table_schema
          AND c.table_name = t.table_name
        WHERE c.table_catalog = '${quotedDbName}'
          AND c.table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `;

      const queryResult = await pool.query(sql);
      const rows = queryResult.toArray();

      // Group by schema → table → columns
      const schemaMap = new Map<string, Map<string, DBTableOrView>>();

      for (const row of rows) {
        const schemaName: string = row.table_schema;
        const tableName: string = row.table_name;
        const tableType: string = row.table_type;
        const columnName: string = row.column_name;
        const ordinalPosition: number = row.ordinal_position;
        const dataType: string = row.data_type;
        const isNullable: string = row.is_nullable;

        if (!schemaMap.has(schemaName)) {
          schemaMap.set(schemaName, new Map());
        }
        const tables = schemaMap.get(schemaName)!;

        if (!tables.has(tableName)) {
          tables.set(tableName, {
            name: tableName,
            label: tableName,
            type: tableType === 'VIEW' ? 'view' : 'table',
            columns: [],
          });
        }

        const column: DBColumn = {
          name: columnName,
          databaseType: dataType,
          nullable: isNullable === 'YES',
          sqlType: normalizeDuckDBColumnType(dataType),
          id: getTableColumnId(columnName, ordinalPosition),
          columnIndex: ordinalPosition,
        };
        tables.get(tableName)!.columns.push(column);
      }

      const metadataKey = formatMotherDuckDbKey(dbName);
      const dbSchemas: DBSchema[] = [];
      for (const [schemaName, tables] of schemaMap) {
        dbSchemas.push({
          name: schemaName,
          objects: Array.from(tables.values()),
        });
      }

      result.set(metadataKey, { name: metadataKey, schemas: dbSchemas });
    } catch (error) {
      console.error(`Failed to load MotherDuck metadata for '${dbName}':`, error);
    }
  }

  // Switch back to the original database
  try {
    await pool.query(`USE ${toDuckDBIdentifier(originalDb)}`);
  } catch (error) {
    console.warn(`Failed to switch back to database '${originalDb}':`, error);
  }

  return result;
}

/**
 * Detaches all MotherDuck databases from DuckDB.
 * This is the low-level DB cleanup; for the full lifecycle (state, tabs,
 * metadata, persistence), use disconnectMotherDuckConnection instead.
 *
 * Note: motherduck_token is an initialization-only setting and cannot be
 * cleared after being set. The token persists for the engine lifetime.
 */
export async function detachMotherDuckDatabases(pool: AsyncDuckDBConnectionPool): Promise<void> {
  // List + detach on a single connection: listMotherDuckDatabases only sees
  // databases attached on the connection it runs against, so it must share a
  // connection with the DETACH statements.
  const databaseNames = await withMotherDuckConnection(pool, async (conn) => {
    const databases = await listMotherDuckDatabases(conn);
    for (const db of databases) {
      try {
        await conn.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(db.name)}`);
      } catch (error) {
        console.warn(`Failed to detach MotherDuck database '${db.name}':`, error);
      }
    }
    return databases.map((db) => db.name);
  });

  // Propagate the detaches globally so every pooled connection reconciles them
  // away (and unregister the md: handshake itself).
  for (const name of databaseNames) {
    pool.registerGlobalDetach(name);
  }
  pool.registerGlobalDetach('md:');
}

/**
 * Updates the connection state of a MotherDuck connection in the store.
 */
export function updateMotherDuckConnectionState(
  id: PersistentDataSourceId,
  state: MotherDuckConnection['connectionState'],
  error?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(id);

  if (!dataSource || dataSource.type !== 'motherduck') {
    return;
  }

  const updated: MotherDuckConnection = {
    ...dataSource,
    connectionState: state,
    connectionError: error,
  };

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(id, updated);
  useAppStore.setState({ dataSources: newDataSources }, false, 'MotherDuck/updateConnectionState');
}

/**
 * Reconnects a persisted MotherDuck connection using a token.
 */
export async function reconnectMotherDuck(
  pool: AsyncDuckDBConnectionPool,
  connection: MotherDuckConnection,
  token: string,
): Promise<boolean> {
  try {
    updateMotherDuckConnectionState(connection.id, 'connecting');

    // Run the whole connect → discover → metadata sequence on ONE connection.
    // The ATTACH 'md:' handshake attaches the user's databases on that
    // connection, so the discovery and metadata queries must run on the same
    // connection to see them (the multi-connection pool would otherwise spread
    // them and find nothing).
    await withMotherDuckConnection(pool, async (conn) => {
      await loadMotherDuckExtension(conn);
      await connectMotherDuck(conn, token);

      // Enumerate and attach every account database, then load their metadata.
      const dbNames = await attachAllMotherDuckDatabases(conn);
      registerMotherDuckDatabaseAttaches(pool, dbNames);

      const { databaseMetadata } = useAppStore.getState();
      try {
        const metadata = await getMotherDuckDatabaseModel(conn, dbNames);
        const newMetadata = new Map(databaseMetadata);
        const discoveredMetadataKeys = new Set(dbNames.map((name) => formatMotherDuckDbKey(name)));

        // Remove stale MotherDuck databases that are no longer present after reconnect.
        for (const key of databaseMetadata.keys()) {
          if (isMotherDuckDbKey(key) && !discoveredMetadataKeys.has(key)) {
            newMetadata.delete(key);
            const dbName = key.slice('md:'.length);
            pool.registerGlobalDetach(dbName);
          }
        }

        for (const [dbName, dbModel] of metadata) {
          newMetadata.set(dbName, dbModel);
        }
        useAppStore.setState(
          { databaseMetadata: newMetadata },
          false,
          'MotherDuck/reconnectMetadata',
        );
      } catch (metadataError) {
        console.error('Failed to load MotherDuck metadata after reconnection:', metadataError);
      }
    });

    updateMotherDuckConnectionState(connection.id, 'connected');

    showSuccess({
      title: 'Reconnected',
      message: 'Successfully reconnected to MotherDuck',
    });

    return true;
  } catch (error) {
    const errorMessage = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
    );

    updateMotherDuckConnectionState(connection.id, 'error', errorMessage);

    showError({
      title: 'Connection Failed',
      message: `Failed to connect to MotherDuck: ${errorMessage}`,
    });

    return false;
  }
}

/**
 * Disconnects a MotherDuck connection: detaches databases, updates state, cleans metadata.
 */
export async function disconnectMotherDuckConnection(
  pool: AsyncDuckDBConnectionPool,
  connection: MotherDuckConnection,
): Promise<void> {
  try {
    await detachMotherDuckDatabases(pool);

    // Update connection state
    updateMotherDuckConnectionState(connection.id, 'disconnected');

    // Remove metadata for every MotherDuck database. Derive the keys from the
    // store (md: prefixed) rather than a live query: the databases are now
    // detached, and a live query on the multi-connection pool is unreliable.
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    for (const key of currentMetadata.keys()) {
      if (isMotherDuckDbKey(key)) {
        newMetadata.delete(key);
      }
    }
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'MotherDuck/disconnect');

    // Close related tabs
    const { tabs } = useAppStore.getState();
    const tabsToClose: TabId[] = [];
    for (const [tabId, tab] of tabs) {
      if (
        tab.type === 'data-source' &&
        tab.dataSourceType === 'db' &&
        tab.dataSourceId === connection.id
      ) {
        tabsToClose.push(tabId);
      }
      if (
        tab.type === 'schema-browser' &&
        tab.sourceType === 'db' &&
        tab.sourceId === connection.id
      ) {
        tabsToClose.push(tabId);
      }
    }
    if (tabsToClose.length > 0) {
      deleteTab(tabsToClose);
    }

    // Persist updated state
    const { _iDbConn } = useAppStore.getState();
    if (_iDbConn) {
      const updatedDs = useAppStore.getState().dataSources.get(connection.id);
      if (updatedDs) {
        await persistPutDataSources(_iDbConn, [updatedDs]);
      }
    }

    showSuccess({
      title: 'Disconnected',
      message: 'Successfully disconnected from MotherDuck',
    });
  } catch (error) {
    const errorMessage = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
    );

    showError({
      title: 'Disconnection Failed',
      message: `Failed to disconnect from MotherDuck: ${errorMessage}`,
    });

    // Still update state to disconnected
    updateMotherDuckConnectionState(connection.id, 'disconnected', errorMessage);
  }
}
