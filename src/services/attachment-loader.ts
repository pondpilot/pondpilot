import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { getFileReferenceForDuckDB } from '@controllers/file-system/file-helpers';
import { getLogger } from '@engines/debug-logger';
import { useAppStore } from '@store/app-store';
import { isTauriEnvironment } from '@utils/browser';
import { isLocalDatabase, isRemoteDatabase } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { buildAttachQuery, buildDetachQuery } from '@utils/sql-builder';
import { isMotherDuckUrl } from '@utils/url-helpers';

import { BrowserCredentialStore } from './browser-credential-store';
import { ConnectionsAPI } from './connections-api';

const logger = getLogger('attachment-loader');

export class AttachmentLoader {
  /**
   * Build CREATE SECRET SQL for WASM environment
   */
  private static buildSecretSql(db: any, credentials: any): string {
    const secretName = `secret_${db.connectionId.replace(/-/g, '_')}`;

    if (db.connectionType === 'postgres' || db.connectionType === 'postgresql') {
      return `CREATE TEMPORARY SECRET IF NOT EXISTS ${secretName} (
        TYPE POSTGRES,
        HOST '${credentials.host}',
        PORT ${credentials.port},
        USER '${credentials.username}',
        PASSWORD '${credentials.password}'
      )`;
    }
    if (db.connectionType === 'mysql') {
      return `CREATE TEMPORARY SECRET IF NOT EXISTS ${secretName} (
        TYPE MYSQL,
        HOST '${credentials.host}',
        PORT ${credentials.port},
        USER '${credentials.username}',
        PASSWORD '${credentials.password}'
      )`;
    }

    throw new Error(`Unsupported database type: ${db.connectionType}`);
  }

  /**
   * Build ATTACH SQL for WASM environment
   */
  private static buildAttachSql(db: any, credentials: any, databaseAlias: string): string {
    const secretName = `secret_${db.connectionId.replace(/-/g, '_')}`;
    const dbType =
      db.connectionType === 'postgres' || db.connectionType === 'postgresql' ? 'POSTGRES' : 'MYSQL';
    const dbParam = dbType === 'POSTGRES' ? 'dbname' : 'database';

    return `ATTACH 'host=${credentials.host} port=${credentials.port} ${dbParam}=${credentials.database}' 
            AS ${databaseAlias} 
            (TYPE ${dbType}, SECRET ${secretName})`;
  }

  /**
   * Attach all LocalDB data sources to the given connection.
   * Idempotent per-connection via conn-level flag handled by the caller.
   */
  static async loadLocalDBsForConnection(connection: any): Promise<void> {
    try {
      const { dataSources, localEntries } = useAppStore.getState();

      const dbs = Array.from(dataSources.values()).filter(
        (ds) => isLocalDatabase(ds as any) || isRemoteDatabase(ds as any),
      );
      if (dbs.length === 0) {
        logger.debug('No local DBs to attach on this connection');
        return;
      }

      for (const db of dbs as any[]) {
        try {
          // Handle connection-based databases (PostgreSQL/MySQL/MotherDuck)
          if (isRemoteDatabase(db) && (db.connectionId || db.connectionType === 'motherduck')) {
            try {
              const attachedDbName = toDuckDBIdentifier(db.dbName);

              if (isTauriEnvironment()) {
                // Special handling for MotherDuck
                if (db.connectionType === 'motherduck') {
                  // MotherDuck uses special syntax without alias
                  if (db.legacyUrl && isMotherDuckUrl(db.legacyUrl)) {
                    const { quote } = await import('@utils/helpers');
                    const attachSql = `ATTACH ${quote(db.legacyUrl, { single: true })}`;
                    await connection.execute(attachSql);

                    // Register with pool for re-attachment
                    await ConnectionsAPI.registerMotherDuckAttachment(db.legacyUrl);
                    logger.info(`Attached and registered MotherDuck database '${db.dbName}'`);

                    // Fetch metadata for the attached MotherDuck database
                    try {
                      // Extract the actual database name from the URL (md:database_name)
                      const actualDbName = db.legacyUrl.slice(3);
                      const metadata = await getDatabaseModel(connection, [actualDbName]);
                      // Update the global metadata store
                      const currentMetadata = useAppStore.getState().databaseMetadata;
                      const updatedMetadata = new Map(currentMetadata);
                      for (const [_dbName, dbModel] of Object.entries(metadata)) {
                        updatedMetadata.set(dbName, dbModel as any);
                      }
                      useAppStore.setState({ databaseMetadata: updatedMetadata });
                      logger.info(`Fetched metadata for MotherDuck database '${actualDbName}'`);
                    } catch (metadataError) {
                      logger.warn('Failed to fetch metadata for MotherDuck:', metadataError);
                    }
                  }
                } else if (db.connectionId) {
                  // PostgreSQL/MySQL: ask backend to handle attachment + secret creation

                  try {
                    await ConnectionsAPI.attachRemoteDatabase(db.connectionId, attachedDbName);

                    logger.info(`Attached connection-based DB '${db.dbName}' on all connections`);

                    // Fetch metadata for the attached database
                    try {
                      const metadata = await getDatabaseModel(connection, [attachedDbName]);
                      // Update the global metadata store
                      const currentMetadata = useAppStore.getState().databaseMetadata;
                      const updatedMetadata = new Map(currentMetadata);
                      for (const [_dbName, dbModel] of Object.entries(metadata)) {
                        // IMPORTANT: Store metadata with the original dbName, not the quoted identifier
                        // The tree builder looks for metadata using db.dbName (raw name)
                        updatedMetadata.set(db.dbName, dbModel as any);
                      }
                      useAppStore.setState({ databaseMetadata: updatedMetadata });
                      logger.info(
                        `Fetched metadata for attached database '${db.dbName}' (attached as '${attachedDbName}')`,
                      );
                    } catch (metadataError) {
                      logger.warn(`Failed to fetch metadata for '${db.dbName}':`, metadataError);
                    }
                  } catch (attachError) {
                    logger.error(`Failed to attach database '${db.dbName}':`, attachError);
                  }
                }
              } else {
                // WASM: Build SQL from browser-stored credentials
                const credentials = await BrowserCredentialStore.get(db.connectionId || '');
                if (!credentials) {
                  logger.warn(`No credentials found for connection ${db.connectionId}`);
                  continue;
                }

                const secretSql = this.buildSecretSql(db, credentials);
                const attachSql = this.buildAttachSql(db, credentials, attachedDbName);

                // Execute on the connection (same for both environments)
                await connection.execute(secretSql);
                await connection.execute(attachSql);

                logger.info(
                  `Attached connection-based DB '${db.dbName}' using WASM browser storage`,
                );

                // Fetch metadata for the attached database
                try {
                  const metadata = await getDatabaseModel(connection, [attachedDbName]);
                  // Update the global metadata store
                  const currentMetadata = useAppStore.getState().databaseMetadata;
                  const updatedMetadata = new Map(currentMetadata);
                  for (const [dbName, dbModel] of Object.entries(metadata)) {
                    updatedMetadata.set(dbName, dbModel as any);
                  }
                  useAppStore.setState({ databaseMetadata: updatedMetadata });
                  logger.info(`Fetched metadata for attached database '${attachedDbName}'`);
                } catch (metadataError) {
                  logger.warn(`Failed to fetch metadata for '${attachedDbName}':`, metadataError);
                }
              }
            } catch (e) {
              logger.error(`Failed to attach connection-based DB '${db.dbName}':`, e);
            }
            continue;
          }

          // Handle local file databases only
          let filePath: string | null = null;
          if (isLocalDatabase(db)) {
            const entry = localEntries.get(db.fileSourceId);
            if (!entry || entry.kind !== 'file') {
              logger.warn(`Source file not found for local DB '${db.dbName}'`);
              continue;
            }
            filePath = getFileReferenceForDuckDB(entry as any);
          }
          if (!filePath) continue;
          const detachSql = buildDetachQuery(db.dbName, true);
          await connection.execute(detachSql).catch(() => {});

          // Attach local database file
          const attachSql = buildAttachQuery(filePath, db.dbName, { readOnly: true });
          await connection.execute(attachSql);
          logger.info(`Attached local database '${db.dbName}' for connection`);
        } catch (e) {
          logger.error(`Failed to attach local DB '${(db as any).dbName}':`, e);
        }
      }
    } catch (error) {
      logger.error('Failed to load local DB attachments for connection:', error);
    }
  }
}
