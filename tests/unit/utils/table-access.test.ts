import { describe, expect, it, beforeEach } from '@jest/globals';
import { useAppStore } from '@store/app-store';
import { makeTableAccessKey, parseTableAccessKey, getTableAccessTime } from '@utils/table-access';

describe('Table Access Utilities', () => {
  describe('makeTableAccessKey', () => {
    it('should create a unique key from database, schema, and table names', () => {
      const key = makeTableAccessKey('mydb', 'public', 'users');

      expect(key).toBe(JSON.stringify(['mydb', 'public', 'users']));
    });

    it('should create different keys for different databases', () => {
      const key1 = makeTableAccessKey('db1', 'public', 'users');
      const key2 = makeTableAccessKey('db2', 'public', 'users');

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different schemas', () => {
      const key1 = makeTableAccessKey('mydb', 'schema1', 'users');
      const key2 = makeTableAccessKey('mydb', 'schema2', 'users');

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different tables', () => {
      const key1 = makeTableAccessKey('mydb', 'public', 'users');
      const key2 = makeTableAccessKey('mydb', 'public', 'posts');

      expect(key1).not.toBe(key2);
    });

    it('should handle names with dots correctly', () => {
      // Dots in names should not cause collisions
      const key1 = makeTableAccessKey('my.db', 'public', 'users');
      const key2 = makeTableAccessKey('my', 'db.public', 'users');

      expect(key1).not.toBe(key2);
    });

    it('should handle names with special characters', () => {
      const key = makeTableAccessKey('my-db', 'public_schema', 'users$table');

      expect(key).toBe(JSON.stringify(['my-db', 'public_schema', 'users$table']));
    });

    it('should handle empty strings', () => {
      const key = makeTableAccessKey('', '', '');

      expect(key).toBe(JSON.stringify(['', '', '']));
    });

    it('should be deterministic', () => {
      const key1 = makeTableAccessKey('mydb', 'public', 'users');
      const key2 = makeTableAccessKey('mydb', 'public', 'users');

      expect(key1).toBe(key2);
    });
  });

  describe('parseTableAccessKey', () => {
    it('should parse a valid key back into components', () => {
      const key = makeTableAccessKey('mydb', 'public', 'users');
      const parsed = parseTableAccessKey(key);

      expect(parsed).toEqual(['mydb', 'public', 'users']);
    });

    it('should return null for invalid JSON', () => {
      const parsed = parseTableAccessKey('not valid json');

      expect(parsed).toBeNull();
    });

    it('should return null for non-array JSON', () => {
      const parsed = parseTableAccessKey(JSON.stringify({ db: 'mydb' }));

      expect(parsed).toBeNull();
    });

    it('should return null for arrays with wrong length', () => {
      const parsed1 = parseTableAccessKey(JSON.stringify(['mydb', 'public']));
      const parsed2 = parseTableAccessKey(JSON.stringify(['mydb', 'public', 'users', 'extra']));

      expect(parsed1).toBeNull();
      expect(parsed2).toBeNull();
    });

    it('should return null for arrays with non-string elements', () => {
      const parsed = parseTableAccessKey(JSON.stringify(['mydb', 123, 'users']));

      expect(parsed).toBeNull();
    });

    it('should handle keys with special characters', () => {
      const key = makeTableAccessKey('my-db', 'public_schema', 'users$table');
      const parsed = parseTableAccessKey(key);

      expect(parsed).toEqual(['my-db', 'public_schema', 'users$table']);
    });

    it('should handle keys with dots in names', () => {
      const key = makeTableAccessKey('my.db', 'public.schema', 'users.table');
      const parsed = parseTableAccessKey(key);

      expect(parsed).toEqual(['my.db', 'public.schema', 'users.table']);
    });

    it('should round-trip correctly', () => {
      const original: [string, string, string] = ['mydb', 'public', 'users'];
      const key = makeTableAccessKey(...original);
      const parsed = parseTableAccessKey(key);

      expect(parsed).toEqual(original);
    });
  });

  describe('getTableAccessTime', () => {
    beforeEach(() => {
      // Reset the store before each test
      useAppStore.setState({
        tableAccessTimes: new Map(),
      });
    });

    it('should return 0 for tables that have never been accessed', () => {
      const time = getTableAccessTime('mydb', 'public', 'users');

      expect(time).toBe(0);
    });

    it('should return the access time for tables that have been accessed', () => {
      const now = Date.now();
      const key = makeTableAccessKey('mydb', 'public', 'users');

      useAppStore.setState({
        tableAccessTimes: new Map([[key, now]]),
      });

      const time = getTableAccessTime('mydb', 'public', 'users');

      expect(time).toBe(now);
    });

    it('should return different times for different tables', () => {
      const time1 = Date.now() - 1000;
      const time2 = Date.now();
      const key1 = makeTableAccessKey('mydb', 'public', 'users');
      const key2 = makeTableAccessKey('mydb', 'public', 'posts');

      useAppStore.setState({
        tableAccessTimes: new Map([
          [key1, time1],
          [key2, time2],
        ]),
      });

      expect(getTableAccessTime('mydb', 'public', 'users')).toBe(time1);
      expect(getTableAccessTime('mydb', 'public', 'posts')).toBe(time2);
    });

    it('should handle tables with dots in names', () => {
      const now = Date.now();
      const key = makeTableAccessKey('my.db', 'public.schema', 'users.table');

      useAppStore.setState({
        tableAccessTimes: new Map([[key, now]]),
      });

      const time = getTableAccessTime('my.db', 'public.schema', 'users.table');

      expect(time).toBe(now);
    });

    it('should return 0 for similar but different table names', () => {
      const now = Date.now();
      const key = makeTableAccessKey('mydb', 'public', 'users');

      useAppStore.setState({
        tableAccessTimes: new Map([[key, now]]),
      });

      // Different database
      expect(getTableAccessTime('otherdb', 'public', 'users')).toBe(0);

      // Different schema
      expect(getTableAccessTime('mydb', 'private', 'users')).toBe(0);

      // Different table
      expect(getTableAccessTime('mydb', 'public', 'posts')).toBe(0);
    });

    it('should handle empty store', () => {
      useAppStore.setState({
        tableAccessTimes: new Map(),
      });

      const time = getTableAccessTime('mydb', 'public', 'users');

      expect(time).toBe(0);
    });

    it('should handle multiple accesses to the same table', () => {
      const oldTime = Date.now() - 10000;
      const newTime = Date.now();
      const key = makeTableAccessKey('mydb', 'public', 'users');

      // First access
      useAppStore.setState({
        tableAccessTimes: new Map([[key, oldTime]]),
      });

      expect(getTableAccessTime('mydb', 'public', 'users')).toBe(oldTime);

      // Second access (simulating an update)
      useAppStore.setState({
        tableAccessTimes: new Map([[key, newTime]]),
      });

      expect(getTableAccessTime('mydb', 'public', 'users')).toBe(newTime);
    });
  });

  describe('Key format consistency', () => {
    it('should use JSON.stringify format for all operations', () => {
      const dbName = 'mydb';
      const schemaName = 'public';
      const tableName = 'users';

      // Create a key
      const key = makeTableAccessKey(dbName, schemaName, tableName);

      // Verify it's in JSON.stringify format
      expect(key).toBe(JSON.stringify([dbName, schemaName, tableName]));

      // Parse it back
      const parsed = parseTableAccessKey(key);
      expect(parsed).toEqual([dbName, schemaName, tableName]);

      // Use it to get access time
      const now = Date.now();
      useAppStore.setState({
        tableAccessTimes: new Map([[key, now]]),
      });

      expect(getTableAccessTime(dbName, schemaName, tableName)).toBe(now);
    });

    it('should not use dot-notation format', () => {
      const key = makeTableAccessKey('mydb', 'public', 'users');

      // Should NOT be dot-notation
      expect(key).not.toBe('mydb.public.users');

      // Should be JSON array format
      expect(key).toBe(JSON.stringify(['mydb', 'public', 'users']));
    });

    it('should avoid collisions that would occur with dot-notation', () => {
      // These would collide with dot-notation but shouldn't with JSON.stringify
      const key1 = makeTableAccessKey('my', 'db.public', 'users');
      const key2 = makeTableAccessKey('my.db', 'public', 'users');

      expect(key1).not.toBe(key2);

      // Verify both can coexist in the store
      const time1 = Date.now() - 1000;
      const time2 = Date.now();

      useAppStore.setState({
        tableAccessTimes: new Map([
          [key1, time1],
          [key2, time2],
        ]),
      });

      expect(getTableAccessTime('my', 'db.public', 'users')).toBe(time1);
      expect(getTableAccessTime('my.db', 'public', 'users')).toBe(time2);
    });
  });
});
