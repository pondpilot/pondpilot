import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { isComparisonResultsTableName } from '@utils/comparison';

export type DropComparisonResultsTableOutcome =
  | { ok: true }
  | { ok: false; error: Error };

export async function dropComparisonResultsTable(
  pool: AsyncDuckDBConnectionPool,
  tableName: string,
): Promise<DropComparisonResultsTableOutcome> {
  if (!isComparisonResultsTableName(tableName)) {
    return {
      ok: false,
      error: new Error(`Attempted to drop non-comparison table "${tableName}"`),
    };
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
