import { ConnectionPool } from '@engines/types';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { isTauriEnvironment } from '@utils/browser';
import { isComparisonResultsTableName } from '@utils/comparison';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

export type DropComparisonResultsTableOutcome = { ok: true } | { ok: false; error: Error };

export async function dropComparisonResultsTable(
  pool: ConnectionPool,
  tableName: string,
): Promise<DropComparisonResultsTableOutcome> {
  if (!isComparisonResultsTableName(tableName)) {
    return {
      ok: false,
      error: new Error(`Attempted to drop non-comparison table "${tableName}"`),
    };
  }

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('drop_comparison_table', { tableName });
      return { ok: true };
    } catch (unknownError) {
      const error =
        unknownError instanceof Error
          ? unknownError
          : new Error(
              String(unknownError ?? 'Unknown error while dropping comparison table via Tauri'),
            );
      return { ok: false, error };
    }
  }

  try {
    await pool.query(
      `DROP TABLE IF EXISTS ${PERSISTENT_DB_NAME}.main.${toDuckDBIdentifier(tableName)}`,
    );
    return { ok: true };
  } catch (unknownError) {
    const error =
      unknownError instanceof Error
        ? unknownError
        : new Error(String(unknownError ?? 'Unknown error while dropping comparison table'));

    return { ok: false, error };
  }
}
