import { persistPutDataSources } from '@controllers/data-source/persist';
import {
  QuackRidgeCapability,
  QuackRidgeConnection,
  PersistentDataSourceId,
} from '@models/data-source';
import { DataBaseModel, DBColumn, DBTableOrView } from '@models/db';
import { AppIdbSchema } from '@models/persisted-store';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { getSecret, SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import {
  formatQuackRidgeDbKey,
  isQuackRidgeDbKey,
  makePersistentDataSourceId,
} from '@utils/data-source';
import { getTableColumnId } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import { IDBPDatabase } from 'idb';

import { attachQuackConnection } from './quack';

export const QUACKRIDGE_PROTOCOL_VERSION = 1 as const;
export const QUACKRIDGE_METADATA_VERSION = 1 as const;
export const QUACKRIDGE_RELEASE_MANIFEST_URL = '/quackridge/releases/stable/release-manifest.json';
export const QUACKRIDGE_REQUIRED_CAPABILITIES = [
  'cancellation_noop',
  'metadata_v1',
  'pairing_v1',
  'query_ids',
  'sticky_sessions',
] as const satisfies readonly QuackRidgeCapability[];

export type QuackRidgeIdentity = {
  product: 'quackridge';
  product_version: string;
  protocol_version: 1;
  metadata_version: 1;
  source_types: ['postgres'];
  read_only: true;
  capabilities: QuackRidgeCapability[];
};

export type QuackRidgePairingResponse = {
  endpoint: string;
  identity: QuackRidgeIdentity;
  token: string;
};

export type QuackRidgePlatform = {
  os: 'darwin' | 'linux' | 'windows';
  arch: 'amd64' | 'arm64';
};

export type QuackRidgeReleaseAsset = QuackRidgePlatform & {
  url: string;
  sha256: string;
  signature: string;
  minimum_os: string;
};

export type QuackRidgeReleaseManifest = {
  version: string;
  channel: 'prerelease' | 'stable';
  protocol: { minimum: number; maximum: number };
  assets: QuackRidgeReleaseAsset[];
};

const PRODUCT_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LOOPBACK_ENDPOINT_PATTERN = /^quack:(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/;
const SUPPORTED_PLATFORMS = new Set([
  'darwin/amd64',
  'darwin/arm64',
  'linux/amd64',
  'windows/amd64',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export function validateQuackRidgeIdentity(value: unknown): QuackRidgeIdentity {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'product',
      'product_version',
      'protocol_version',
      'metadata_version',
      'source_types',
      'read_only',
      'capabilities',
    ]) ||
    value.product !== 'quackridge'
  ) {
    throw new Error(
      'The attached server is not QuackRidge. Use the generic Quack connection flow.',
    );
  }
  if (
    typeof value.product_version !== 'string' ||
    !PRODUCT_VERSION_PATTERN.test(value.product_version) ||
    value.protocol_version !== QUACKRIDGE_PROTOCOL_VERSION ||
    value.metadata_version !== QUACKRIDGE_METADATA_VERSION ||
    value.read_only !== true ||
    !Array.isArray(value.source_types) ||
    value.source_types.length !== 1 ||
    value.source_types[0] !== 'postgres' ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.some((capability) => typeof capability !== 'string')
  ) {
    throw new Error('This QuackRidge version is not compatible with PondPilot.');
  }

  const capabilities = value.capabilities as string[];
  if (
    capabilities.length !== QUACKRIDGE_REQUIRED_CAPABILITIES.length ||
    !QUACKRIDGE_REQUIRED_CAPABILITIES.every((capability) => capabilities.includes(capability))
  ) {
    throw new Error('This QuackRidge server does not provide the required v1 capabilities.');
  }
  return value as QuackRidgeIdentity;
}

export function validateQuackRidgeEndpoint(endpoint: string): void {
  const match = LOOPBACK_ENDPOINT_PATTERN.exec(endpoint.trim());
  if (!match)
    throw new Error('QuackRidge endpoints must use Quack on the local loopback interface.');
  if (match[1] && Number(match[1]) > 65_535)
    throw new Error('QuackRidge endpoint port is invalid.');
}

export function validateQuackRidgePairingResponse(value: unknown): QuackRidgePairingResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['endpoint', 'identity', 'token'])) {
    throw new Error('QuackRidge returned a malformed pairing response.');
  }
  if (typeof value.endpoint !== 'string') throw new Error('Pairing response endpoint is missing.');
  validateQuackRidgeEndpoint(value.endpoint);
  if (typeof value.token !== 'string' || value.token.length < 32) {
    throw new Error('QuackRidge returned an invalid authentication token.');
  }
  return {
    endpoint: value.endpoint,
    identity: validateQuackRidgeIdentity(value.identity),
    token: value.token,
  };
}

export function validatePairingChallengeUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Pairing URL is invalid.');
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.protocol !== 'http:' ||
    !isLoopback ||
    url.pathname !== '/v1/pair' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Pairing must use the temporary QuackRidge loopback URL.');
  }
  return url;
}

export async function pairWithQuackRidge(
  challengeUrl: string,
  nonce: string,
  fetcher: typeof fetch = fetch,
): Promise<QuackRidgePairingResponse> {
  const url = validatePairingChallengeUrl(challengeUrl);
  if (nonce.trim().length < 16) throw new Error('Pairing nonce is invalid or incomplete.');
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: nonce.trim() }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new Error(
      'Could not reach the local QuackRidge pairing service. Start pairing again and retry.',
    );
  }
  if (!response.ok) {
    if (response.status === 409)
      throw new Error('This pairing code was already used. Start pairing again.');
    if (response.status === 410) throw new Error('This pairing code expired. Start pairing again.');
    if (response.status === 401 || response.status === 403) {
      throw new Error('Pairing was rejected. Verify the code and the allowed PondPilot origin.');
    }
    throw new Error('QuackRidge pairing failed. Start pairing again and retry.');
  }
  return validateQuackRidgePairingResponse(await response.json());
}

export function validateQuackRidgeReleaseManifest(value: unknown): QuackRidgeReleaseManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['version', 'channel', 'protocol', 'assets']) ||
    typeof value.version !== 'string' ||
    !PRODUCT_VERSION_PATTERN.test(value.version) ||
    (value.channel !== 'prerelease' && value.channel !== 'stable') ||
    !isRecord(value.protocol) ||
    !hasExactKeys(value.protocol, ['minimum', 'maximum']) ||
    !Number.isInteger(value.protocol.minimum) ||
    !Number.isInteger(value.protocol.maximum) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('The QuackRidge release manifest is malformed.');
  }
  if (
    (value.protocol.minimum as number) > QUACKRIDGE_PROTOCOL_VERSION ||
    (value.protocol.maximum as number) < QUACKRIDGE_PROTOCOL_VERSION
  ) {
    throw new Error('This QuackRidge release does not support PondPilot protocol v1.');
  }

  const assets = value.assets.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ['os', 'arch', 'url', 'sha256', 'signature', 'minimum_os']) ||
      !['darwin', 'linux', 'windows'].includes(candidate.os as string) ||
      !['amd64', 'arm64'].includes(candidate.arch as string) ||
      typeof candidate.url !== 'string' ||
      typeof candidate.sha256 !== 'string' ||
      !SHA256_PATTERN.test(candidate.sha256) ||
      typeof candidate.signature !== 'string' ||
      candidate.signature.length === 0 ||
      typeof candidate.minimum_os !== 'string' ||
      candidate.minimum_os.length === 0
    ) {
      throw new Error('The QuackRidge release manifest contains an invalid asset.');
    }
    const url = new URL(candidate.url);
    if (url.protocol !== 'https:') throw new Error('QuackRidge release assets must use HTTPS.');
    return candidate as QuackRidgeReleaseAsset;
  });

  return { ...value, assets } as QuackRidgeReleaseManifest;
}

export async function fetchQuackRidgeReleaseManifest(
  manifestUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<QuackRidgeReleaseManifest> {
  const url = new URL(manifestUrl, globalThis.location?.origin ?? 'https://app.pondpilot.io');
  const isSameOriginPath = manifestUrl.startsWith('/') && !manifestUrl.startsWith('//');
  const isLocalDevelopment =
    isSameOriginPath &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('QuackRidge manifest URL must use HTTPS.');
  }
  const response = await fetcher(url, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Could not load the QuackRidge release manifest.');
  return validateQuackRidgeReleaseManifest(await response.json());
}

export function selectQuackRidgeAsset(
  manifest: QuackRidgeReleaseManifest,
  platform: QuackRidgePlatform,
): QuackRidgeReleaseAsset | null {
  if (!SUPPORTED_PLATFORMS.has(`${platform.os}/${platform.arch}`)) return null;
  return (
    manifest.assets.find((asset) => asset.os === platform.os && asset.arch === platform.arch) ??
    null
  );
}

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (
      hints: string[],
    ) => Promise<{ architecture?: string; bitness?: string }>;
  };
};

export async function detectQuackRidgePlatform(
  navigatorValue: NavigatorWithUAData = navigator as NavigatorWithUAData,
): Promise<QuackRidgePlatform | null> {
  const uaPlatform = navigatorValue.userAgentData?.platform ?? navigatorValue.platform;
  const os = /mac/i.test(uaPlatform)
    ? 'darwin'
    : /win/i.test(uaPlatform)
      ? 'windows'
      : /linux/i.test(uaPlatform)
        ? 'linux'
        : null;
  if (!os) return null;

  let architecture = '';
  try {
    const values = await navigatorValue.userAgentData?.getHighEntropyValues?.([
      'architecture',
      'bitness',
    ]);
    architecture = `${values?.architecture ?? ''}${values?.bitness ?? ''}`;
  } catch {
    // Some browsers refuse high-entropy UA hints; stay conservative below.
  }
  const evidence = `${architecture} ${navigatorValue.userAgent}`;
  const arch = /arm64|aarch64/i.test(evidence)
    ? 'arm64'
    : /x86_64|x64|amd64|win64/i.test(evidence)
      ? 'amd64'
      : null;
  if (!arch || !SUPPORTED_PLATFORMS.has(`${os}/${arch}`)) return null;
  return { os, arch };
}

export async function identifyQuackRidge(
  pool: AsyncDuckDBConnectionPool,
  alias: string,
): Promise<QuackRidgeIdentity> {
  const sql = `SELECT name, meta FROM ${toDuckDBIdentifier(alias)}.query('${escapeSqlStringValue('FROM whoami()')}')`;
  const result = await pool.query(sql);
  if (result.numRows !== 1) throw new Error('QuackRidge identity response is missing.');
  const name = result.getChild('name')?.get(0);
  const meta = result.getChild('meta')?.get(0);
  if (name !== 'QuackRidge' || (typeof meta !== 'string' && !isRecord(meta))) {
    throw new Error(
      'The attached server is not QuackRidge. Use the generic Quack connection flow.',
    );
  }
  let identity: unknown = meta;
  if (typeof meta === 'string') {
    try {
      identity = JSON.parse(meta);
    } catch {
      throw new Error('QuackRidge returned malformed identity metadata.');
    }
  } else {
    // Apache Arrow exposes STRUCT values as StructRow wrappers. Convert the
    // wrapper through its JSON representation before enforcing exact keys.
    try {
      identity = JSON.parse(JSON.stringify(meta));
    } catch {
      throw new Error('QuackRidge returned malformed identity metadata.');
    }
  }
  if (
    isRecord(identity) &&
    identity.product === 'quackridge' &&
    typeof identity.product_version === 'string' &&
    PRODUCT_VERSION_PATTERN.test(identity.product_version) &&
    Number(identity.protocol_version) === QUACKRIDGE_PROTOCOL_VERSION &&
    typeof identity.duckdb_version === 'string' &&
    typeof identity.platform === 'string'
  ) {
    // Quack's whoami() exposes a fixed identity struct and omits custom meta
    // keys. Protocol v1 defines the remaining fields and required capability
    // set, while pairing validates the complete identity before attachment.
    return {
      product: 'quackridge',
      product_version: identity.product_version,
      protocol_version: QUACKRIDGE_PROTOCOL_VERSION,
      metadata_version: QUACKRIDGE_METADATA_VERSION,
      source_types: ['postgres'],
      read_only: true,
      capabilities: [...QUACKRIDGE_REQUIRED_CAPABILITIES],
    };
  }
  return validateQuackRidgeIdentity(identity);
}

const QUERY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function buildQuackRidgeQuery(alias: string, statement: string, queryId: string): string {
  if (!QUERY_ID_PATTERN.test(queryId)) throw new Error('QuackRidge query ID is invalid.');
  const completeStatement = statement.trim().replace(/;\s*$/, '');
  const remoteSql = `/* quackridge-query-id:${queryId} */ ${completeStatement}`;
  return `SELECT * FROM ${toDuckDBIdentifier(alias)}.query('${escapeSqlStringValue(remoteSql)}')`;
}

export function findQuackRidgeLocalReference(
  statement: string,
  localCatalogs: readonly string[],
): string | null {
  for (const catalog of localCatalogs) {
    const escaped = catalog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bare = new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}\\s*\\.`, 'i');
    const quoted = new RegExp(`"${escaped.replace(/"/g, '""')}"\\s*\\.`, 'i');
    if (bare.test(statement) || quoted.test(statement)) return catalog;
  }
  return null;
}

const QUACKRIDGE_ERROR_MESSAGES: Record<string, string> = {
  QR_AUTHENTICATION: 'QuackRidge authentication failed. Pair again or update the stored token.',
  QR_PROTOCOL_MISMATCH: 'QuackRidge is not compatible with this PondPilot version.',
  QR_SOURCE_UNAVAILABLE: 'The requested private source is unavailable in QuackRidge.',
  QR_REJECTED_STATEMENT: 'QuackRidge rejected this statement under its read-only policy.',
  QR_CANCELLED: 'The QuackRidge query was cancelled.',
  QR_TIMEOUT: 'The QuackRidge query exceeded its execution limit.',
  QR_RESOURCE_EXHAUSTED: 'QuackRidge reached a configured resource limit.',
  QR_INTERNAL: 'QuackRidge could not complete the query.',
};

export function mapQuackRidgeError(error: unknown): string {
  const raw = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
  const code = Object.keys(QUACKRIDGE_ERROR_MESSAGES).find((candidate) => raw.includes(candidate));
  if (code) return QUACKRIDGE_ERROR_MESSAGES[code];
  if (/\bauthorization failed\b/i.test(raw)) {
    return QUACKRIDGE_ERROR_MESSAGES.QR_REJECTED_STATEMENT;
  }
  return raw;
}

type QuackRidgeMetadataRow = {
  source_id: string;
  source_name: string;
  source_type: string;
  source_health: string;
  catalog_name: string;
  schema_name: string | null;
  object_name: string | null;
  object_type: string | null;
  column_name: string | null;
  ordinal_position: number | null;
  duckdb_type: string | null;
  nullable: boolean | null;
  error_code: string | null;
};

export async function getQuackRidgeDatabaseModel(
  pool: AsyncDuckDBConnectionPool,
  alias: string,
): Promise<Map<string, DataBaseModel>> {
  const query = buildQuackRidgeQuery(
    alias,
    `SELECT *
FROM quackridge_metadata_v1()
WHERE schema_name IS NULL OR schema_name NOT IN ('information_schema', 'pg_catalog')
ORDER BY catalog_name, schema_name, object_name, ordinal_position`,
    'metadata',
  );
  const result = await pool.query(query);
  const metadata = new Map<string, DataBaseModel>();
  const fieldNames = [
    'source_id',
    'source_name',
    'source_type',
    'source_health',
    'catalog_name',
    'schema_name',
    'object_name',
    'object_type',
    'column_name',
    'ordinal_position',
    'duckdb_type',
    'nullable',
    'error_code',
  ] as const satisfies readonly (keyof QuackRidgeMetadataRow)[];
  const columns = Object.fromEntries(
    fieldNames.map((fieldName) => [fieldName, result.getChild(fieldName)]),
  ) as Record<(typeof fieldNames)[number], { get: (index: number) => unknown } | null>;

  for (let rowIndex = 0; rowIndex < result.numRows; rowIndex += 1) {
    const raw = Object.fromEntries(
      fieldNames.map((fieldName) => [fieldName, columns[fieldName]?.get(rowIndex) ?? null]),
    ) as Record<(typeof fieldNames)[number], unknown>;
    const row: QuackRidgeMetadataRow = {
      source_id: String(raw.source_id ?? ''),
      source_name: String(raw.source_name ?? ''),
      source_type: String(raw.source_type ?? ''),
      source_health: String(raw.source_health ?? ''),
      catalog_name: String(raw.catalog_name ?? ''),
      schema_name: raw.schema_name === null ? null : String(raw.schema_name),
      object_name: raw.object_name === null ? null : String(raw.object_name),
      object_type: raw.object_type === null ? null : String(raw.object_type),
      column_name: raw.column_name === null ? null : String(raw.column_name),
      ordinal_position: raw.ordinal_position === null ? null : Number(raw.ordinal_position),
      duckdb_type: raw.duckdb_type === null ? null : String(raw.duckdb_type),
      nullable: raw.nullable === null ? null : Boolean(raw.nullable),
      error_code: raw.error_code === null ? null : String(raw.error_code),
    };
    if (!row.catalog_name) continue;

    const metadataKey = formatQuackRidgeDbKey(alias, row.catalog_name);
    let model = metadata.get(metadataKey);
    if (!model) {
      model = {
        name: row.catalog_name,
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceType: row.source_type,
        sourceHealth: row.source_health,
        sourceErrorCode: row.error_code,
        schemas: [],
      };
      metadata.set(metadataKey, model);
    }
    if (
      row.source_health !== 'ready' ||
      !row.schema_name ||
      !row.object_name ||
      !row.object_type ||
      !row.column_name ||
      row.ordinal_position === null ||
      !row.duckdb_type ||
      row.nullable === null
    ) {
      continue;
    }
    let schema = model.schemas.find((candidate) => candidate.name === row.schema_name);
    if (!schema) {
      schema = {
        name: row.schema_name,
        objects: [],
      };
      model.schemas.push(schema);
    }
    let object = schema.objects.find((candidate) => candidate.name === row.object_name);
    if (!object) {
      object = {
        name: row.object_name,
        label: row.object_name,
        type: row.object_type === 'view' ? 'view' : 'table',
        columns: [],
      } satisfies DBTableOrView;
      schema.objects.push(object);
    }
    const column: DBColumn = {
      name: row.column_name,
      databaseType: row.duckdb_type,
      nullable: row.nullable,
      sqlType: normalizeDuckDBColumnType(row.duckdb_type),
      columnIndex: row.ordinal_position,
      id: getTableColumnId(row.column_name, row.ordinal_position),
    };
    object.columns.push(column);
  }
  return metadata;
}

export async function refreshQuackRidgeMetadata(
  pool: AsyncDuckDBConnectionPool,
  connection: Pick<QuackRidgeConnection, 'alias'>,
): Promise<void> {
  const metadata = await getQuackRidgeDatabaseModel(pool, connection.alias);
  const next = new Map(useAppStore.getState().databaseMetadata);
  for (const name of next.keys()) {
    if (isQuackRidgeDbKey(name, connection.alias)) next.delete(name);
  }
  for (const [name, model] of metadata) next.set(name, model);
  useAppStore.setState({ databaseMetadata: next }, false, 'QuackRidge/loadMetadata');
}

export async function attachAndIdentifyQuackRidge(params: {
  pool: AsyncDuckDBConnectionPool;
  endpoint: string;
  alias: string;
  token: string;
}): Promise<QuackRidgeIdentity> {
  validateQuackRidgeEndpoint(params.endpoint);
  await attachQuackConnection({
    pool: params.pool,
    uri: params.endpoint,
    dbName: params.alias,
    token: params.token,
    disableSsl: true,
  });
  try {
    return await identifyQuackRidge(params.pool, params.alias);
  } catch (error) {
    await params.pool
      .query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(params.alias)}`)
      .catch(() => undefined);
    throw error;
  }
}

export function makeQuackRidgeConnection(params: {
  endpoint: string;
  alias: string;
  identity: QuackRidgeIdentity;
  secretRef: SecretId;
}): QuackRidgeConnection {
  const now = Date.now();
  return {
    type: 'quackridge',
    id: makePersistentDataSourceId(),
    endpoint: params.endpoint.trim(),
    alias: params.alias.trim(),
    productVersion: params.identity.product_version,
    protocolVersion: QUACKRIDGE_PROTOCOL_VERSION,
    capabilities: [...params.identity.capabilities],
    connectionState: 'connected',
    pairedAt: now,
    attachedAt: now,
    lastConnectedAt: now,
    secretRef: params.secretRef,
  };
}

export async function resolveQuackRidgeToken(
  iDb: IDBPDatabase<AppIdbSchema>,
  connection: QuackRidgeConnection,
): Promise<string | null> {
  const secret = await getSecret(iDb, connection.secretRef);
  return secret?.data.token ?? null;
}

export function updateQuackRidgeConnectionState(
  id: PersistentDataSourceId,
  connectionState: QuackRidgeConnection['connectionState'],
  connectionError?: string,
): void {
  const dataSources = useAppStore.getState().dataSources;
  const current = dataSources.get(id);
  if (!current || current.type !== 'quackridge') return;
  const next = new Map(dataSources);
  next.set(id, {
    ...current,
    connectionState,
    connectionError,
    ...(connectionState === 'connected' ? { lastConnectedAt: Date.now() } : {}),
  });
  useAppStore.setState({ dataSources: next }, false, 'QuackRidge/updateConnectionState');
}

export async function reconnectQuackRidgeConnection(
  pool: AsyncDuckDBConnectionPool,
  connection: QuackRidgeConnection,
  token: string,
): Promise<void> {
  updateQuackRidgeConnectionState(connection.id, 'connecting');
  try {
    await attachAndIdentifyQuackRidge({
      pool,
      endpoint: connection.endpoint,
      alias: connection.alias,
      token,
    });
    await refreshQuackRidgeMetadata(pool, connection);
    updateQuackRidgeConnectionState(connection.id, 'connected');
  } catch (error) {
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    updateQuackRidgeConnectionState(connection.id, 'error', message);
    throw new Error(message);
  }
}

export async function disconnectQuackRidgeConnection(
  pool: AsyncDuckDBConnectionPool,
  connection: QuackRidgeConnection,
): Promise<void> {
  await pool.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(connection.alias)}`);
  const metadata = new Map(useAppStore.getState().databaseMetadata);
  for (const name of metadata.keys()) {
    if (isQuackRidgeDbKey(name, connection.alias)) metadata.delete(name);
  }
  useAppStore.setState({ databaseMetadata: metadata }, false, 'QuackRidge/disconnect');
  updateQuackRidgeConnectionState(connection.id, 'disconnected');
}

export async function persistQuackRidgeConnection(connection: QuackRidgeConnection): Promise<void> {
  const { _iDbConn } = useAppStore.getState();
  if (!_iDbConn) throw new Error('Encrypted secret store is not available.');
  await persistPutDataSources(_iDbConn, [connection]);
}
