import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, QuackConnection } from '@models/data-source';
import { DataBaseModel, DBColumn, DBTableOrView } from '@models/db';
import { AppIdbSchema } from '@models/persisted-store';
import { getSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import { getTableColumnId } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { getViteEnv } from '@utils/env';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import * as arrow from 'apache-arrow';
import { IDBPDatabase } from 'idb';

export interface AttachQuackOptions {
  pool: AsyncDuckDBConnectionPool;
  uri: string;
  dbName: string;
  token: string;
  disableSsl?: boolean;
}

export function validateQuackUri(uri: string): { isValid: boolean; error?: string } {
  const trimmed = uri.trim();
  if (!trimmed) return { isValid: false, error: 'Quack URI is required' };
  if (/[;'"\\]/.test(trimmed)) {
    return { isValid: false, error: 'URI contains unsupported characters' };
  }
  if (!/^quack:(?:\/\/)?[^/\s][^\s]*$/i.test(trimmed)) {
    return { isValid: false, error: 'URI must start with quack: and include a host' };
  }
  return { isValid: true };
}

export function buildQuackSecretName(dbName: string): string {
  return `pondpilot_quack_${dbName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function buildAttachQuackQuery(
  uri: string,
  dbName: string,
  disableSsl = false,
  token?: string,
): string {
  const options = [
    ...(token ? [`TOKEN '${escapeSqlStringValue(token)}'`] : []),
    ...(disableSsl ? ['DISABLE_SSL true'] : []),
  ];
  const optionsClause = options.length ? ` (${options.join(', ')})` : '';
  return `ATTACH '${escapeSqlStringValue(uri)}' AS ${toDuckDBIdentifier(dbName)}${optionsClause}`;
}

const QUACK_QUERY_TIMEOUT_MS = 20_000;

async function queryQuackWithTimeout<T>(query: Promise<T>, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${operation} timed out after ${QUACK_QUERY_TIMEOUT_MS / 1000}s. ` +
            'The current DuckDB-WASM bundle may not support Quack yet.',
        ),
      );
    }, QUACK_QUERY_TIMEOUT_MS);
  });

  // The loser of Promise.race keeps running. When the timeout wins, attach a
  // catch to the underlying query so its eventual rejection doesn't surface as
  // an unhandled promise rejection — but log it so the underlying cause isn't
  // entirely swallowed.
  query.catch((error) => {
    console.warn(`Quack query lost race with timeout (${operation}):`, error);
  });

  try {
    return await Promise.race([query, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const getQuackWasmExtensionUrls = (): string[] => {
  const configuredUrl = getViteEnv().VITE_QUACK_WASM_EXTENSION_URL;

  return [
    ...(configuredUrl ? [configuredUrl] : []),
    // The official v1.5.2 artifact contains the full Quack extension symbols.
    // It is kept as a direct-load fallback for newer DuckDB-WASM builds and as a
    // storage-support retry when repository-loaded artifacts only expose helper
    // functions without registering the Quack ATTACH storage type.
    'https://extensions.duckdb.org/v1.5.2/wasm_eh/quack.duckdb_extension.wasm',
  ];
};

async function tryLoadQuackFromPinnedWasm(
  pool: AsyncDuckDBConnectionPool,
): Promise<{ loaded: true } | { loaded: false; error: string }> {
  const errors: string[] = [];

  for (const url of getQuackWasmExtensionUrls()) {
    try {
      await queryQuackWithTimeout(
        pool.query(`LOAD '${escapeSqlStringValue(url)}'`),
        'Loading the pinned Quack WASM extension',
      );
      return { loaded: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already loaded/i.test(message)) {
        return { loaded: true };
      }
      errors.push(`${url}: ${message}`);
      console.warn('Failed to load pinned Quack WASM extension:', url, message);
    }
  }

  return { loaded: false, error: errors.join('; ') };
}

const QUACK_EXTENSION_REPOSITORIES = [
  'core_nightly',
  'community',
  "'https://community-extensions.duckdb.org'",
];

async function tryLoadQuackFromRepositories(
  pool: AsyncDuckDBConnectionPool,
): Promise<{ loaded: true } | { loaded: false; error: string }> {
  const repositoryErrors: string[] = [];

  for (const repository of QUACK_EXTENSION_REPOSITORIES) {
    for (const installCommand of [
      `FORCE INSTALL quack FROM ${repository}`,
      `INSTALL quack FROM ${repository}`,
    ]) {
      try {
        await queryQuackWithTimeout(
          pool.query(installCommand),
          `Installing the Quack extension from ${repository}`,
        );
        await queryQuackWithTimeout(pool.query('LOAD quack'), 'Loading the Quack extension');
        return { loaded: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/already loaded/i.test(message)) {
          return { loaded: true };
        }
        repositoryErrors.push(`${installCommand}: ${message}`);
      }
    }
  }

  return { loaded: false, error: repositoryErrors.join('; ') };
}

export async function loadQuackExtension(pool: AsyncDuckDBConnectionPool): Promise<void> {
  const repositoryResult = await tryLoadQuackFromRepositories(pool);
  if (repositoryResult.loaded) return;

  const pinnedResult = await tryLoadQuackFromPinnedWasm(pool);
  if (pinnedResult.loaded) {
    try {
      await queryQuackWithTimeout(pool.query('LOAD quack'), 'Loading the Quack extension');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/already loaded|wasm magic number|could not be loaded|no extension found|failed to download/i.test(
          message,
        )
      ) {
        throw error;
      }
      console.warn('Failed to load Quack by name after pinned WASM load:', message);
    }
    return;
  }

  throw new Error(
    'The current DuckDB-WASM bundle cannot load the Quack extension yet. ' +
      'Upgrade DuckDB-WASM to a build that ships Quack support. ' +
      `Repository errors: ${repositoryResult.error}. ` +
      `Pinned WASM extension fallbacks failed: ${pinnedResult.error}`,
  );
}

async function runAttachQuackQuery({
  pool,
  uri,
  dbName,
  token,
  disableSsl,
}: AttachQuackOptions): Promise<void> {
  await queryQuackWithTimeout(
    pool.query(buildAttachQuackQuery(uri, dbName, disableSsl, token)),
    'Attaching the Quack connection',
  );
}

export async function attachQuackConnection({
  pool,
  uri,
  dbName,
  token,
  disableSsl,
}: AttachQuackOptions): Promise<void> {
  await loadQuackExtension(pool);
  try {
    await runAttachQuackQuery({ pool, uri, dbName, token, disableSsl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unrecognized storage type\s+"?quack"?/i.test(message)) {
      const pinnedResult = await tryLoadQuackFromPinnedWasm(pool);
      if (pinnedResult.loaded) {
        try {
          await runAttachQuackQuery({ pool, uri, dbName, token, disableSsl });
          return;
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError);
          throw new Error(
            'The current DuckDB-WASM bundle loaded Quack but does not register Quack ATTACH support yet. ' +
              `Upgrade DuckDB-WASM to a build with Quack storage support. Original error: ${message}. ` +
              `Pinned WASM retry failed: ${retryMessage}`,
          );
        }
      }
      throw new Error(
        'The current DuckDB-WASM bundle loaded Quack but does not register Quack ATTACH support yet. ' +
          `Upgrade DuckDB-WASM to a build with Quack storage support. Original error: ${message}. ` +
          `Pinned WASM retry could not load Quack storage support: ${pinnedResult.error}`,
      );
    }
    throw error;
  }
}

export async function resolveQuackToken(
  iDb: IDBPDatabase<AppIdbSchema>,
  connection: QuackConnection,
): Promise<string | null> {
  if (!connection.secretRef) return null;
  const secret = await getSecret(iDb, connection.secretRef);
  return secret?.data?.token ?? null;
}

export function updateQuackConnectionState(
  id: PersistentDataSourceId,
  connectionState: QuackConnection['connectionState'],
  connectionError?: string,
): void {
  const currentDataSources = useAppStore.getState().dataSources;
  const dataSource = currentDataSources.get(id);

  if (!dataSource || dataSource.type !== 'quack') return;

  const newDataSources = new Map(currentDataSources);
  newDataSources.set(id, { ...dataSource, connectionState, connectionError });
  useAppStore.setState({ dataSources: newDataSources }, false, 'Quack/updateConnectionState');
}

type QuackColumnsQueryArrowType = {
  is_table: arrow.Bool;
  schema_name: arrow.Utf8;
  table_name: arrow.Utf8;
  column_name: arrow.Utf8;
  column_index: arrow.Int32;
  data_type: arrow.Utf8;
  is_nullable: arrow.Bool;
};

export async function getQuackDatabaseModel(
  pool: AsyncDuckDBConnectionPool,
  dbName: string,
): Promise<Map<string, DataBaseModel>> {
  // Scope the metadata query to the remote server's default (current) database
  // so a server with multiple attached databases doesn't collapse same-named
  // schemas into one local DataBaseModel. As a consequence, additional user
  // databases exposed by the same Quack server are intentionally not surfaced
  // here — only the default DB's schemas appear in the explorer.
  const remoteMetadataSql = `
    SELECT
      dt.table_oid IS NOT NULL AS is_table,
      dc.schema_name,
      dc.table_name,
      dc.column_name,
      dc.column_index,
      dc.data_type,
      dc.is_nullable
    FROM duckdb_columns() AS dc
    LEFT JOIN duckdb_tables() AS dt
      ON dc.database_name = dt.database_name
     AND dc.schema_name = dt.schema_name
     AND dc.table_name = dt.table_name
     AND dc.table_oid = dt.table_oid
    WHERE NOT dc.internal
      AND dc.database_name = current_database()
      AND dc.schema_name NOT IN ('information_schema', 'pg_catalog')
    ORDER BY dc.schema_name, dc.table_name, dc.column_index
  `;

  const result = await pool.query<QuackColumnsQueryArrowType>(
    `SELECT * FROM ${toDuckDBIdentifier(dbName)}.query('${escapeSqlStringValue(remoteMetadataSql)}')`,
  );

  const dbModel: DataBaseModel = { name: dbName, schemas: [] };
  const columns = {
    is_table: result.getChild('is_table'),
    schema_name: result.getChild('schema_name'),
    table_name: result.getChild('table_name'),
    column_name: result.getChild('column_name'),
    column_index: result.getChild('column_index'),
    data_type: result.getChild('data_type'),
    is_nullable: result.getChild('is_nullable'),
  };

  for (let i = 0; i < result.numRows; i += 1) {
    const schemaName = columns.schema_name?.get(i);
    const tableName = columns.table_name?.get(i);
    const columnName = columns.column_name?.get(i);
    const columnIndex = columns.column_index?.get(i);
    const dataType = columns.data_type?.get(i);
    const isNullable = columns.is_nullable?.get(i);
    const isTable = columns.is_table?.get(i) ?? false;

    if (
      !schemaName ||
      !tableName ||
      !columnName ||
      columnIndex === undefined ||
      columnIndex === null ||
      !dataType ||
      isNullable === undefined ||
      isNullable === null
    ) {
      console.warn('Skipping Quack metadata row with missing values:', {
        schemaName,
        tableName,
        columnName,
        columnIndex,
        dataType,
        isNullable,
      });
      continue;
    }

    let schema = dbModel.schemas.find((candidate) => candidate.name === schemaName);
    if (!schema) {
      schema = { name: schemaName, objects: [] };
      dbModel.schemas.push(schema);
    }

    let tableOrView = schema.objects.find((candidate) => candidate.name === tableName);
    if (!tableOrView) {
      tableOrView = {
        name: tableName,
        label: tableName,
        type: isTable ? 'table' : 'view',
        columns: [],
      } satisfies DBTableOrView;
      schema.objects.push(tableOrView);
    }

    const column: DBColumn = {
      name: columnName,
      databaseType: dataType,
      nullable: isNullable,
      sqlType: normalizeDuckDBColumnType(dataType),
      id: getTableColumnId(columnName, columnIndex),
      columnIndex,
    };
    tableOrView.columns.push(column);
  }

  return new Map([[dbName, dbModel]]);
}

export async function refreshQuackMetadata(
  pool: AsyncDuckDBConnectionPool,
  connection: Pick<QuackConnection, 'dbName'>,
): Promise<void> {
  const metadata = await getQuackDatabaseModel(pool, connection.dbName);
  const currentMetadata = useAppStore.getState().databaseMetadata;
  const newMetadata = new Map(currentMetadata);
  for (const [dbName, dbModel] of metadata) newMetadata.set(dbName, dbModel);
  useAppStore.setState({ databaseMetadata: newMetadata }, false, 'Quack/loadMetadata');
}

/**
 * Reconnect a Quack data source from the data explorer or other UI entry
 * points: resolves the stored token, surfaces user-facing errors via
 * notifications, and delegates the actual reconnect to
 * reconnectQuackConnection. Returns true on success.
 */
export async function reconnectQuackDataSource(
  pool: AsyncDuckDBConnectionPool,
  connection: QuackConnection,
): Promise<boolean> {
  const { _iDbConn } = useAppStore.getState();
  if (!_iDbConn) {
    showError({
      title: 'Reconnect unavailable',
      message: 'Encrypted secret store is not available.',
    });
    return false;
  }
  const token = await resolveQuackToken(_iDbConn, connection);
  if (!token) {
    showError({
      title: 'Reconnect unavailable',
      message: 'No stored credentials for this Quack server. Add it again to reconnect.',
    });
    return false;
  }
  try {
    await reconnectQuackConnection(pool, connection, token);
    return true;
  } catch (error) {
    showError({
      title: 'Reconnect failed',
      message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
    });
    return false;
  }
}

export async function reconnectQuackConnection(
  pool: AsyncDuckDBConnectionPool,
  connection: QuackConnection,
  token: string,
): Promise<void> {
  updateQuackConnectionState(connection.id, 'connecting');
  try {
    await attachQuackConnection({
      pool,
      uri: connection.uri,
      dbName: connection.dbName,
      token,
      disableSsl: connection.disableSsl,
    });

    await refreshQuackMetadata(pool, connection);
    updateQuackConnectionState(connection.id, 'connected');
  } catch (error) {
    const sanitized = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    updateQuackConnectionState(connection.id, 'error', sanitized);
    throw error;
  }
}

export async function disconnectQuackConnection(
  pool: AsyncDuckDBConnectionPool,
  connection: QuackConnection,
): Promise<void> {
  try {
    await pool.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(connection.dbName)}`);
    const currentMetadata = useAppStore.getState().databaseMetadata;
    const newMetadata = new Map(currentMetadata);
    newMetadata.delete(connection.dbName);
    useAppStore.setState({ databaseMetadata: newMetadata }, false, 'Quack/disconnect');
    updateQuackConnectionState(connection.id, 'disconnected');

    // Tabs that reference this Quack source are intentionally left open so a
    // subsequent reconnect restores their working context. They will error
    // gracefully while the connection is detached.

    showSuccess({ title: 'Quack disconnected', message: `${connection.dbName} disconnected` });
  } catch (error) {
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    updateQuackConnectionState(connection.id, 'error', message);
    showError({ title: 'Failed to disconnect Quack', message });
  }
}

export function makeQuackConnection(params: {
  uri: string;
  dbName: string;
  secretRef?: QuackConnection['secretRef'];
  disableSsl?: boolean;
  comment?: string;
}): QuackConnection {
  return {
    type: 'quack',
    id: makePersistentDataSourceId(),
    uri: params.uri.trim(),
    dbName: params.dbName.trim(),
    connectionState: 'connecting',
    attachedAt: Date.now(),
    secretRef: params.secretRef,
    disableSsl: params.disableSsl,
    comment: params.comment,
  };
}

export async function persistQuackConnection(connection: QuackConnection): Promise<void> {
  const { _iDbConn } = useAppStore.getState();
  if (_iDbConn) await persistPutDataSources(_iDbConn, [connection]);
}
