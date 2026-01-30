/**
 * ATTACH/DETACH Statement Handler
 *
 * Handles side effects of SQL ATTACH and DETACH statements executed in the
 * script editor — creating or removing data source entries so they appear
 * in the sidebar and persist across reloads.
 */

import { persistPutDataSources, persistDeleteDataSource } from '@controllers/data-source/persist';
import { IcebergCatalog, RemoteDB, AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import {
  parseAttachStatement,
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

/**
 * Process ATTACH statements, creating data source entries for newly attached
 * remote databases and Iceberg catalogs.
 */
export async function handleAttachStatements(
  statements: ClassifiedSQLStatement[],
  context: AttachDetachContext,
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
        const catalog: IcebergCatalog = {
          type: 'iceberg-catalog',
          id: makePersistentDataSourceId(),
          catalogAlias: icebergParsed.catalogAlias,
          warehouseName: icebergParsed.warehouseName,
          endpoint: icebergParsed.endpoint ?? '',
          authType: 'none',
          connectionState: 'connected',
          attachedAt: Date.now(),
          secretName: icebergParsed.secretName ?? '',
          endpointType: icebergParsed.endpointType as 'GLUE' | 'S3_TABLES' | undefined,
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
      const [dbId] = dbToRemove;
      context.updatedDataSources.delete(dbId);
      context.updatedMetadata.delete(dbName);

      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        await persistDeleteDataSource(_iDbConn, [dbId], []);
      }
    }
  }
}
