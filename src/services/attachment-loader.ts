import { getFileReferenceForDuckDB } from '@controllers/file-system/file-helpers';
import { getLogger } from '@engines/debug-logger';
import { useAppStore } from '@store/app-store';
import { isLocalDatabase, isRemoteDatabase } from '@utils/data-source';
import { buildAttachQuery, buildDetachQuery } from '@utils/sql-builder';

const logger = getLogger('attachment-loader');

export class AttachmentLoader {
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
          // Determine URL/path depending on data source type
          let filePath: string | null = null;
          if (isLocalDatabase(db)) {
            const entry = localEntries.get(db.fileSourceId);
            if (!entry || entry.kind !== 'file') {
              logger.warn(`Source file not found for local DB '${db.dbName}'`);
              continue;
            }
            filePath = getFileReferenceForDuckDB(entry as any);
          } else if (isRemoteDatabase(db)) {
            filePath = db.url;
          }
          if (!filePath) continue;
          const detachSql = buildDetachQuery(db.dbName, true);
          await connection.execute(detachSql).catch(() => {});
          const attachSql = buildAttachQuery(filePath, db.dbName, { readOnly: true });
          await connection.execute(attachSql);
          logger.info(`Attached local DB '${db.dbName}' for connection`);
        } catch (e) {
          logger.error(`Failed to attach local DB '${(db as any).dbName}':`, e);
        }
      }
    } catch (error) {
      logger.error('Failed to load local DB attachments for connection:', error);
    }
  }
}
