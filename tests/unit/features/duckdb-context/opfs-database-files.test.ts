import {
  isWalReplayFailure,
  OPFS_DB_REGISTRATION_PREFIX,
  planOpfsDatabaseRegistration,
} from '@features/duckdb-context/opfs-database-files';
import { describe, it, expect } from '@jest/globals';

describe('opfs-database-files', () => {
  describe('planOpfsDatabaseRegistration', () => {
    it('plans the database file plus WAL and WAL marker files', () => {
      const plan = planOpfsDatabaseRegistration('opfs://pondpilot.db');
      expect(plan).not.toBeNull();
      expect(plan!.registeredDbPath).toBe(`${OPFS_DB_REGISTRATION_PREFIX}pondpilot.db`);
      expect(plan!.files).toEqual([
        {
          registeredName: `${OPFS_DB_REGISTRATION_PREFIX}pondpilot.db`,
          opfsFileName: 'pondpilot.db',
        },
        {
          registeredName: `${OPFS_DB_REGISTRATION_PREFIX}pondpilot.db.wal`,
          opfsFileName: 'pondpilot.db.wal',
        },
        {
          registeredName: `${OPFS_DB_REGISTRATION_PREFIX}pondpilot.db.wal.checkpoint`,
          opfsFileName: 'pondpilot.db.wal.checkpoint',
        },
        {
          registeredName: `${OPFS_DB_REGISTRATION_PREFIX}pondpilot.db.wal.recovery`,
          opfsFileName: 'pondpilot.db.wal.recovery',
        },
      ]);
    });

    it('keeps the catalog-relevant basename intact in the registered path', () => {
      const plan = planOpfsDatabaseRegistration('opfs://pondpilot.db');
      // DuckDB derives the catalog name from the path basename; the prefix is
      // a pseudo-directory and must not change it.
      expect(plan!.registeredDbPath.split('/').pop()).toBe('pondpilot.db');
    });

    it('returns null for non-opfs paths', () => {
      expect(planOpfsDatabaseRegistration('pondpilot.db')).toBeNull();
      expect(planOpfsDatabaseRegistration('http://example.com/x.db')).toBeNull();
    });

    it('returns null for nested opfs paths', () => {
      expect(planOpfsDatabaseRegistration('opfs://dir/pondpilot.db')).toBeNull();
    });

    it('returns null for an empty opfs file name', () => {
      expect(planOpfsDatabaseRegistration('opfs://')).toBeNull();
    });

    it('uses a pseudo-directory prefix that cannot collide with user file basenames', () => {
      // User-added files are registered under their basenames, which can
      // never contain a path separator.
      expect(OPFS_DB_REGISTRATION_PREFIX).toContain('/');
    });
  });

  describe('isWalReplayFailure', () => {
    it('matches the WAL replay failure DuckDB raises on a stale WAL tail', () => {
      expect(
        isWalReplayFailure(
          'Opening the database failed with error: {"exception_type":"INTERNAL",' +
            '"exception_message":"Failure while replaying WAL file ' +
            '\\"__pondpilot__/pondpilot.db.wal\\": Invalid WAL entry type!"}',
        ),
      ).toBe(true);
      expect(isWalReplayFailure('Invalid WAL entry type!')).toBe(true);
    });

    it('does not match unrelated open failures', () => {
      expect(
        isWalReplayFailure(
          'Access Handles cannot be created if there is another open Access Handle',
        ),
      ).toBe(false);
      expect(isWalReplayFailure('IO Error: extension not available')).toBe(false);
    });
  });
});
