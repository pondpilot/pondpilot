/**
 * OPFS database file registration plan.
 *
 * DuckDB-WASM's direct `opfs://` database support is broken in the version
 * line this app uses (duckdb-wasm 1.33.1-dev34.0+, upstream issue
 * duckdb/duckdb-wasm#2192): DuckDB core collapses duplicate slashes in paths
 * whose scheme it does not treat as remote (`opfs://x` → `opfs:/x`), so the
 * engine-side file registry — populated under the original `opfs://x` name —
 * misses, and the runtime silently falls back to an in-memory buffer
 * ("Buffering missing file"). Queries succeed but nothing is ever written to
 * OPFS: the database is lost on reload.
 *
 * The workaround: skip the `opfs://` path machinery entirely. We register the
 * OPFS file handles ourselves under scheme-less names (nothing to collapse)
 * and open the database by that registered name with `useDirectIO` (required
 * so a fresh, empty OPFS file is treated as a new database instead of failing
 * validation). Durability verified at checkpoint granularity — the same
 * guarantee the last-good upstream version (1.33.1-dev20.0) provided.
 *
 * The registered name is prefixed with a pseudo-directory so it can never
 * collide with user-added files, which are registered under their plain
 * basenames (a basename cannot contain `/`). The catalog name DuckDB derives
 * from the path basename is unaffected by the prefix.
 */

/** Pseudo-directory prefix for the main database's registered file names. */
export const OPFS_DB_REGISTRATION_PREFIX = '__pondpilot__/';

/**
 * Companion files DuckDB may open next to a database file, derived by
 * appending to the database path: the write-ahead log plus the checkpoint /
 * recovery markers newer DuckDB versions use during WAL handling.
 */
const DB_FILE_SUFFIXES = ['', '.wal', '.wal.checkpoint', '.wal.recovery'];

export interface OpfsDatabaseFileRegistration {
  /** Name the file is registered under in DuckDB's file registry. */
  registeredName: string;
  /** File name inside the OPFS root directory. */
  opfsFileName: string;
}

export interface OpfsDatabaseRegistrationPlan {
  /** Path to pass to `db.open()` — the registered name of the database file. */
  registeredDbPath: string;
  /** All files to pre-register (database, WAL, WAL markers). */
  files: OpfsDatabaseFileRegistration[];
}

/**
 * Builds the registration plan for an `opfs://` database path.
 *
 * Only root-level OPFS files are supported (PondPilot always persists to
 * `opfs://pondpilot.db`); returns null for nested or non-opfs paths so the
 * caller can fall back to the library's own path handling.
 */
export function planOpfsDatabaseRegistration(
  opfsDbPath: string,
): OpfsDatabaseRegistrationPlan | null {
  if (!opfsDbPath.startsWith('opfs://')) return null;

  const fileName = opfsDbPath.slice('opfs://'.length);
  if (!fileName || fileName.includes('/')) return null;

  return {
    registeredDbPath: `${OPFS_DB_REGISTRATION_PREFIX}${fileName}`,
    files: DB_FILE_SUFFIXES.map((suffix) => ({
      registeredName: `${OPFS_DB_REGISTRATION_PREFIX}${fileName}${suffix}`,
      opfsFileName: `${fileName}${suffix}`,
    })),
  };
}

/**
 * Returns true when a database open failed because DuckDB hit invalid data
 * while replaying the WAL — e.g. "Failure while replaying WAL file ...:
 * Invalid WAL entry type!".
 *
 * This happens with stale mixed-generation WAL bytes: DuckDB deletes the WAL
 * file after a checkpoint, but the WASM runtime's removeFile is a no-op, so
 * the next WAL generation is written from offset zero over older, longer
 * content and a later replay runs past the valid entries into garbage.
 * Recoverable by clearing the WAL companions and reopening — the database
 * file itself holds everything up to the last checkpoint.
 */
export function isWalReplayFailure(message: string): boolean {
  return /replaying WAL|Invalid WAL entry/i.test(message);
}
