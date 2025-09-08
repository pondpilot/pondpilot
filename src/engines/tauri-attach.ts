import { getLogger } from './debug-logger';

const logger = getLogger('database:tauri-attach');

export interface AttachSpecItem {
  dbName: string;
  url?: string;
  readOnly: boolean;
  rawSql?: string[];
}

export async function buildAttachSpec(): Promise<AttachSpecItem[]> {
  try {
    const { useAppStore } = await import('../store/app-store');
    const { getFileReferenceForDuckDB } = await import('../controllers/file-system/file-helpers');
    const { ConnectionsAPI } = await import('../services/connections-api');
    const state = useAppStore.getState();
    const attaches: AttachSpecItem[] = [];
    for (const ds of state.dataSources.values()) {
      if (ds.type === 'attached-db') {
        const entry = state.localEntries.get(ds.fileSourceId);
        if (entry && entry.kind === 'file' && entry.fileType === 'data-source') {
          const url = getFileReferenceForDuckDB(entry);
          attaches.push({ dbName: ds.dbName, url, readOnly: true });
        }
      } else if (ds.type === 'remote-db') {
        if (ds.legacyUrl && ds.legacyUrl.trim() !== '') {
          attaches.push({ dbName: ds.dbName, url: ds.legacyUrl, readOnly: true });
        } else if ((ds as any).connectionId) {
          try {
            const res = await ConnectionsAPI.getAttachmentSql((ds as any).connectionId, ds.dbName);
            const rawSql: string[] = [];
            if ((res as any).secret_sql && (res as any).secret_sql.trim() !== '') rawSql.push((res as any).secret_sql);
            if ((res as any).attach_sql && (res as any).attach_sql.trim() !== '') rawSql.push((res as any).attach_sql);
            if (rawSql.length > 0) {
              attaches.push({ dbName: ds.dbName, readOnly: true, rawSql });
            }
          } catch (e) {
            logger.debug('[tauri-attach] Failed to get attachment SQL for connection', ds, e);
          }
        }
      }
    }
    return attaches;
  } catch (e) {
    logger.debug('Failed to build attach spec', e);
    return [];
  }
}

export function buildAttachStatements(spec: AttachSpecItem[]): string[] {
  const escapeIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const escapeStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const stmts: string[] = [];
  for (const item of spec) {
    const { dbName, url, readOnly, rawSql } = item;
    if (rawSql && rawSql.length > 0) {
      stmts.push(`DETACH DATABASE IF EXISTS ${escapeIdent(dbName)}`);
      stmts.push(...rawSql);
      continue;
    }
    if (!url || url.trim() === '') continue;
    stmts.push(`DETACH DATABASE IF EXISTS ${escapeIdent(dbName)}`);
    if (url.startsWith('md:')) {
      stmts.push(`ATTACH ${escapeStr(url)}`);
    } else if (readOnly) {
      stmts.push(`ATTACH ${escapeStr(url)} AS ${escapeIdent(dbName)} (READ_ONLY)`);
    } else {
      stmts.push(`ATTACH ${escapeStr(url)} AS ${escapeIdent(dbName)}`);
    }
  }
  return stmts;
}
