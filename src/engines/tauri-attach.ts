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
          // Connection-backed databases are attached natively by the backend.
          // We intentionally avoid reconstructing the attachment SQL in the renderer
          // to keep credentials inside the Rust process.
          logger.trace(
            '[tauri-attach] Skipping inline attachment SQL for connection-backed database',
            ds,
          );
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
