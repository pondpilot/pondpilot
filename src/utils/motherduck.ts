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
import { AppIdbSchema } from '@models/persisted-store';
import { TabId } from '@models/tab';
import { getSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { formatMotherDuckDbKey, isMotherDuckDbKey } from '@utils/data-source';
import { getTableColumnId } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { IDBPDatabase } from 'idb';

/** MotherDuck extension version API endpoint. */
const MD_EXTENSION_VERSION_URL = 'https://api.motherduck.com/extension_version';

/** DuckDB version header sent to the MotherDuck API. */
const DUCKDB_VERSION_HEADER = 'v1.4.3';

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
export async function isMotherDuckExtensionLoaded(
  pool: AsyncDuckDBConnectionPool,
): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT extension_name FROM duckdb_extensions() WHERE extension_name = 'motherduck' AND loaded = true",
    );
    return result.numRows > 0;
  } catch {
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
export async function loadMotherDuckExtension(pool: AsyncDuckDBConnectionPool): Promise<void> {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'MotherDuck requires SharedArrayBuffer. Ensure Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers are configured.',
    );
  }

  if (await isMotherDuckExtensionLoaded(pool)) {
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MD_FETCH_TIMEOUT_MS);

  let versionResponse: Response;
  try {
    versionResponse = await fetch(MD_EXTENSION_VERSION_URL, {
      headers: { 'x-md-duckdb-version': DUCKDB_VERSION_HEADER },
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
  const safeRepo = repo.replace(/'/g, "''");

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
export async function connectMotherDuck(
  pool: AsyncDuckDBConnectionPool,
  token: string,
): Promise<void> {
  // Set the token — configures the credential for the MotherDuck extension.
  // DuckDB-WASM does not support parameterized SET statements, so we inline
  // the token as a string literal with single-quote escaping. The pool.query
  // API executes a single statement, so semicolons in the value cannot cause
  // statement multiplexing.
  await pool.query(`SET motherduck_token='${token.replace(/'/g, "''")}';`);

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
  pool: AsyncDuckDBConnectionPool,
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
 * Loads schema metadata for MotherDuck databases.
 *
 * MotherDuck's remote catalogs don't support three-part name resolution
 * (e.g. `my_db.information_schema.columns` fails). To work around this,
 * we switch the active database with `USE`, query `information_schema`
 * which resolves relative to the current database, then switch back.
 *
 * Results are stored under 'md:' prefixed keys (e.g. 'md:my_db') to avoid
 * collisions with local databases and to let the tree builder identify them.
 */
export async function getMotherDuckDatabaseModel(
  pool: AsyncDuckDBConnectionPool,
  dbNames: string[],
): Promise<Map<string, DataBaseModel>> {
  const result = new Map<string, DataBaseModel>();
  if (dbNames.length === 0) return result;

  // Remember the current database so we can switch back
  let originalDb = 'pondpilot';
  try {
    const dbResult = await pool.query('SELECT current_database() AS db');
    originalDb = dbResult.toArray()[0]?.db ?? 'pondpilot';
  } catch {
    // Fall back to default
  }

  for (const dbName of dbNames) {
    try {
      // Switch to the MotherDuck database
      await pool.query(`USE ${toDuckDBIdentifier(dbName)}`);

      // Query information_schema — resolves to the current (MotherDuck) database.
      // MotherDuck's shared catalog exposes all databases in information_schema,
      // so we filter by table_catalog to get only the current database's objects.
      const quotedDbName = dbName.replace(/'/g, "''");
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
  } catch {
    // Best effort — the local database should always be available
  }

  return result;
}

/**
 * Detaches all MotherDuck databases from DuckDB and clears the token.
 * This is the low-level DB cleanup; for the full lifecycle (state, tabs,
 * metadata, persistence), use disconnectMotherDuckConnection instead.
 */
export async function detachMotherDuckDatabases(pool: AsyncDuckDBConnectionPool): Promise<void> {
  // Find all MotherDuck databases (type='motherduck', plain names)
  const databases = await listMotherDuckDatabases(pool);

  // Detach each one using the plain database name
  for (const db of databases) {
    try {
      await pool.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(db.name)}`);
    } catch (error) {
      console.warn(`Failed to detach MotherDuck database '${db.name}':`, error);
    }
  }

  // Clear the token
  try {
    await pool.query("SET motherduck_token='';");
  } catch {
    // Ignore — token may already be cleared
  }
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

    await loadMotherDuckExtension(pool);
    await connectMotherDuck(pool, token);

    // Load metadata for discovered databases via information_schema
    const databases = await listMotherDuckDatabases(pool);
    const dbNames = databases.map((db) => db.name);

    const { databaseMetadata } = useAppStore.getState();
    try {
      const metadata = await getMotherDuckDatabaseModel(pool, dbNames);
      const newMetadata = new Map(databaseMetadata);
      const discoveredMetadataKeys = new Set(dbNames.map((name) => formatMotherDuckDbKey(name)));

      // Remove stale MotherDuck databases that are no longer present after reconnect.
      for (const key of databaseMetadata.keys()) {
        if (isMotherDuckDbKey(key) && !discoveredMetadataKeys.has(key)) {
          newMetadata.delete(key);
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
    // Find all MotherDuck databases to clean up their metadata
    const databases = await listMotherDuckDatabases(pool);

    await detachMotherDuckDatabases(pool);

    // Update connection state
    updateMotherDuckConnectionState(connection.id, 'disconnected');

    // Remove metadata for MotherDuck databases
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    for (const db of databases) {
      newMetadata.delete(formatMotherDuckDbKey(db.name));
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
