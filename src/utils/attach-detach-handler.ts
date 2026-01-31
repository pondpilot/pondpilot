/**
 * ATTACH/DETACH Statement Handler
 *
 * Handles side effects of SQL ATTACH and DETACH statements executed in the
 * script editor — creating or removing data source entries so they appear
 * in the sidebar and persist across reloads.
 */

import { persistPutDataSources, persistDeleteDataSource } from '@controllers/data-source/persist';
import { IcebergCatalog, RemoteDB, AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { makeSecretId, putSecret, deleteSecret } from '@services/secret-store';
import type { SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import {
  parseAttachStatement,
  parseCreateSecretStatement,
  parseDetachStatement,
  parseIcebergAttachStatement,
} from '@utils/attach-parser';
import { normalizeRemoteUrl } from '@utils/cors-proxy-config';
import { makePersistentDataSourceId } from '@utils/data-source';
import { ClassifiedSQLStatement, SQLStatement } from '@utils/editor/sql';

export interface AttachDetachContext {
  dataSources: Map<PersistentDataSourceId, AnyDataSource>;
  updatedDataSources: Map<PersistentDataSourceId, AnyDataSource>;
  updatedMetadata: Map<string, unknown>;
}

/** Info stored per CREATE SECRET for use by the attach handler. */
export interface SecretMappingEntry {
  secretRef: SecretId;
  secretType: string;
  authType: IcebergCatalog['authType'];
}

/**
 * Process CREATE SECRET statements, persisting credentials into the encrypted
 * secret store. Returns a mapping from DuckDB secret name to SecretMappingEntry
 * so the attach handler can look up auth type without re-parsing.
 */
export async function handleCreateSecretStatements(
  statements: ClassifiedSQLStatement[],
): Promise<Map<string, SecretMappingEntry>> {
  const secretMapping = new Map<string, SecretMappingEntry>();
  const { _iDbConn } = useAppStore.getState();
  if (!_iDbConn) return secretMapping;

  for (const statement of statements) {
    if (statement.type !== SQLStatement.CREATE) continue;

    const parsed = parseCreateSecretStatement(statement.code);
    if (!parsed) continue;

    const id = makeSecretId();

    // Normalize SQL option names (uppercase) to the camelCase field names
    // that resolveIcebergCredentials expects.
    const data: Record<string, string> = {};
    const { options } = parsed;
    const authType = deriveAuthType(parsed.secretType, options);
    data.authType = authType;
    if (options.CLIENT_ID) data.clientId = options.CLIENT_ID;
    if (options.CLIENT_SECRET) data.clientSecret = options.CLIENT_SECRET;
    if (options.TOKEN) data.token = options.TOKEN;
    if (options.KEY_ID) data.awsKeyId = options.KEY_ID;
    if (options.SECRET) data.awsSecret = options.SECRET;
    if (options.REGION) data.defaultRegion = options.REGION;
    if (options.OAUTH2_SERVER_URI) data.oauth2ServerUri = options.OAUTH2_SERVER_URI;

    await putSecret(_iDbConn, id, {
      label: `SQL Secret: ${parsed.secretName}`,
      data,
    });

    secretMapping.set(parsed.secretName, {
      secretRef: id,
      secretType: parsed.secretType,
      authType,
    });
  }

  return secretMapping;
}

/**
 * Derive the Iceberg auth type from a CREATE SECRET's TYPE and options.
 */
function deriveAuthType(
  secretType: string,
  options: Record<string, string>,
): IcebergCatalog['authType'] {
  if (secretType === 's3') return 'sigv4';
  if (options.CLIENT_ID) return 'oauth2';
  if (options.TOKEN) return 'bearer';
  return 'none';
}

/**
 * Infer a secret from the SQL batch when no explicit SECRET option is given
 * in the ATTACH statement. Returns a match only when exactly one CREATE SECRET
 * in the batch has a type compatible with the endpoint.
 *
 * Endpoint type to secret type mapping:
 * - S3_TABLES / GLUE → requires TYPE s3
 * - Everything else (REST) → requires TYPE iceberg
 */
function inferSecretFromBatch(
  secretMapping: Map<string, SecretMappingEntry>,
  endpointType?: string,
): { secretName: string; entry: SecretMappingEntry } | undefined {
  const requiredSecretType =
    endpointType?.toUpperCase() === 'S3_TABLES' || endpointType?.toUpperCase() === 'GLUE'
      ? 's3'
      : 'iceberg';

  const candidates: { secretName: string; entry: SecretMappingEntry }[] = [];

  for (const [secretName, entry] of secretMapping) {
    if (entry.secretType === requiredSecretType) {
      candidates.push({ secretName, entry });
    }
  }

  // Only infer when there's exactly one matching candidate
  if (candidates.length === 1) {
    return candidates[0];
  }

  return undefined;
}

/**
 * Process ATTACH statements, creating data source entries for newly attached
 * remote databases and Iceberg catalogs.
 */
export async function handleAttachStatements(
  statements: ClassifiedSQLStatement[],
  context: AttachDetachContext,
  secretMapping?: Map<string, SecretMappingEntry>,
): Promise<void> {
  for (const statement of statements) {
    if (statement.type !== SQLStatement.ATTACH) {
      continue;
    }

    // Try Iceberg first — if it matches, skip remote DB handling
    const icebergParsed = parseIcebergAttachStatement(statement.code);
    if (icebergParsed) {
      // Check if this catalog is already registered by alias
      const existingCatalog = Array.from(context.dataSources.values()).find(
        (ds) => ds.type === 'iceberg-catalog' && ds.catalogAlias === icebergParsed.catalogAlias,
      );

      if (!existingCatalog) {
        // Resolve the secret reference and auth type from the mapping
        let resolvedSecretName = icebergParsed.secretName;
        let secretRef: SecretId | undefined;
        let authType: IcebergCatalog['authType'] = 'none';

        if (resolvedSecretName) {
          // Explicit SECRET in ATTACH
          const entry = secretMapping?.get(resolvedSecretName);
          if (entry) {
            secretRef = entry.secretRef;
            authType = entry.authType;
          }
        } else if (secretMapping && secretMapping.size > 0) {
          // No explicit SECRET — try to infer from batch
          const match = inferSecretFromBatch(secretMapping, icebergParsed.endpointType);
          if (match) {
            resolvedSecretName = match.secretName;
            secretRef = match.entry.secretRef;
            authType = match.entry.authType;
          }
        }

        const catalog: IcebergCatalog = {
          type: 'iceberg-catalog',
          id: makePersistentDataSourceId(),
          catalogAlias: icebergParsed.catalogAlias,
          warehouseName: icebergParsed.warehouseName,
          endpoint: icebergParsed.endpoint ?? '',
          authType,
          connectionState: 'connected',
          attachedAt: Date.now(),
          secretName: resolvedSecretName ?? '',
          endpointType: icebergParsed.endpointType as 'GLUE' | 'S3_TABLES' | undefined,
          secretRef,
        };

        context.updatedDataSources.set(catalog.id, catalog);

        const { _iDbConn } = useAppStore.getState();
        if (_iDbConn) {
          await persistPutDataSources(_iDbConn, [catalog]);
        }
      }
      continue;
    }

    // Fallback: existing remote DB handling
    const parsed = parseAttachStatement(statement.code);
    if (parsed) {
      const { rawUrl, dbName } = parsed;
      const { url, isRemote } = normalizeRemoteUrl(rawUrl);

      if (isRemote) {
        const existingDb = Array.from(context.dataSources.values()).find(
          (ds) =>
            (ds.type === 'remote-db' && ds.dbName === dbName) ||
            (ds.type === 'attached-db' && ds.dbName === dbName),
        );

        if (!existingDb) {
          const remoteDb: RemoteDB = {
            type: 'remote-db',
            id: makePersistentDataSourceId(),
            url,
            dbName,
            dbType: 'duckdb',
            connectionState: 'connected',
            attachedAt: Date.now(),
          };

          context.updatedDataSources.set(remoteDb.id, remoteDb);

          const { _iDbConn } = useAppStore.getState();
          if (_iDbConn) {
            await persistPutDataSources(_iDbConn, [remoteDb]);
          }
        }
      }
    }
  }
}

/**
 * Process DETACH statements, removing data source entries for detached
 * databases and Iceberg catalogs.
 */
export async function handleDetachStatements(
  statements: ClassifiedSQLStatement[],
  context: AttachDetachContext,
): Promise<void> {
  for (const statement of statements) {
    if (statement.type !== SQLStatement.DETACH) {
      continue;
    }

    const dbName = parseDetachStatement(statement.code);
    if (!dbName) {
      continue;
    }

    // Search across all database data source types
    const dbToRemove = Array.from(context.updatedDataSources.entries()).find(
      ([, ds]) =>
        (ds.type === 'remote-db' && ds.dbName === dbName) ||
        (ds.type === 'attached-db' && ds.dbName === dbName) ||
        (ds.type === 'iceberg-catalog' && ds.catalogAlias === dbName),
    );

    if (dbToRemove) {
      const [dbId, ds] = dbToRemove;
      context.updatedDataSources.delete(dbId);
      context.updatedMetadata.delete(dbName);

      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        // Clean up the encrypted secret if this was an Iceberg catalog with a secretRef
        if (ds.type === 'iceberg-catalog' && ds.secretRef) {
          try {
            await deleteSecret(_iDbConn, ds.secretRef);
          } catch {
            // Best-effort cleanup
          }
        }
        await persistDeleteDataSource(_iDbConn, [dbId], []);
      }
    }
  }
}
