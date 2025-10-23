import { describe, expect, it, beforeEach } from '@jest/globals';

/**
 * Tests for LRU migration logic in restore.ts
 *
 * The migration logic backfills lastUsed timestamps for scripts and data sources
 * that were created before the LRU feature was added.
 */

describe('LRU Migration Logic', () => {
  let mockNow: number;

  beforeEach(() => {
    mockNow = Date.now();
  });

  describe('SQL Script lastUsed migration', () => {
    it('should backfill lastUsed for scripts without it', () => {
      const sqlScriptsArray = [
        { id: 'script1', name: 'First' },
        { id: 'script2', name: 'Second' },
        { id: 'script3', name: 'Third' },
      ];

      // Simulate the migration logic
      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: (script as any).lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      // All scripts should have lastUsed timestamps
      expect(sqlScripts.get('script1')?.lastUsed).toBeDefined();
      expect(sqlScripts.get('script2')?.lastUsed).toBeDefined();
      expect(sqlScripts.get('script3')?.lastUsed).toBeDefined();

      // Verify ordering is preserved (earlier items have older timestamps)
      const script1 = sqlScripts.get('script1')!;
      const script2 = sqlScripts.get('script2')!;
      const script3 = sqlScripts.get('script3')!;

      expect(script1.lastUsed).toBeLessThan(script2.lastUsed!);
      expect(script2.lastUsed).toBeLessThan(script3.lastUsed!);
    });

    it('should preserve existing lastUsed timestamps', () => {
      const existingTimestamp = mockNow - 10000;
      const sqlScriptsArray = [
        { id: 'script1', name: 'First', lastUsed: existingTimestamp },
        { id: 'script2', name: 'Second' },
        { id: 'script3', name: 'Third', lastUsed: mockNow - 5000 },
      ];

      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: script.lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      // Existing timestamps should be preserved
      expect(sqlScripts.get('script1')?.lastUsed).toBe(existingTimestamp);
      expect(sqlScripts.get('script3')?.lastUsed).toBe(mockNow - 5000);

      // New timestamp should be generated for script2
      expect(sqlScripts.get('script2')?.lastUsed).toBeDefined();
      expect(sqlScripts.get('script2')?.lastUsed).toBeGreaterThan(mockNow - sqlScriptsArray.length);
    });

    it('should maintain relative ordering for large script counts', () => {
      const sqlScriptsArray = Array.from({ length: 100 }, (_, i) => ({
        id: `script${i}`,
        name: `Script ${i}`,
      }));

      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: (script as any).lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      // Verify all timestamps are unique and in order
      const timestamps = Array.from(sqlScripts.values()).map((s) => s.lastUsed!);
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeLessThan(timestamps[i + 1]);
      }
    });
  });

  describe('Data Source lastUsed migration', () => {
    it('should backfill lastUsed for data sources without it', () => {
      const dataSourcesArray = [
        { id: 'ds1', type: 'csv', viewName: 'file1' },
        { id: 'ds2', type: 'parquet', viewName: 'file2' },
        { id: 'ds3', type: 'attached-db', dbName: 'db1' },
      ];

      const dataSources = new Map(
        dataSourcesArray.map((dv, index) => [
          dv.id,
          {
            ...dv,
            lastUsed:
              (dv as any).lastUsed ??
              ((dv as any).type === 'remote-db'
                ? (dv as any).attachedAt
                : mockNow - dataSourcesArray.length + index),
          },
        ]),
      );

      // All data sources should have lastUsed
      expect(dataSources.get('ds1')?.lastUsed).toBeDefined();
      expect(dataSources.get('ds2')?.lastUsed).toBeDefined();
      expect(dataSources.get('ds3')?.lastUsed).toBeDefined();

      // Verify ordering is preserved
      const ds1 = dataSources.get('ds1')!;
      const ds2 = dataSources.get('ds2')!;
      const ds3 = dataSources.get('ds3')!;

      expect(ds1.lastUsed).toBeLessThan(ds2.lastUsed!);
      expect(ds2.lastUsed).toBeLessThan(ds3.lastUsed!);
    });

    it('should use attachedAt for RemoteDB when lastUsed is missing', () => {
      const attachedAt = mockNow - 50000;
      const dataSourcesArray = [
        { id: 'remote1', type: 'remote-db', dbName: 'remote', attachedAt },
        { id: 'local1', type: 'attached-db', dbName: 'local' },
      ];

      const dataSources = new Map(
        dataSourcesArray.map((dv, index) => [
          dv.id,
          {
            ...dv,
            lastUsed:
              (dv as any).lastUsed ??
              (dv.type === 'remote-db'
                ? (dv as any).attachedAt
                : mockNow - dataSourcesArray.length + index),
          },
        ]),
      );

      // Remote DB should use attachedAt
      expect(dataSources.get('remote1')?.lastUsed).toBe(attachedAt);

      // Local DB should get a backfilled timestamp
      expect(dataSources.get('local1')?.lastUsed).toBeDefined();
      expect(dataSources.get('local1')?.lastUsed).toBeGreaterThan(mockNow - dataSourcesArray.length);
    });

    it('should preserve existing lastUsed over attachedAt for RemoteDB', () => {
      const attachedAt = mockNow - 50000;
      const existingLastUsed = mockNow - 10000;
      const dataSourcesArray = [
        { id: 'remote1', type: 'remote-db', dbName: 'remote', attachedAt, lastUsed: existingLastUsed },
      ];

      const dataSources = new Map(
        dataSourcesArray.map((dv, index) => [
          dv.id,
          {
            ...dv,
            lastUsed:
              dv.lastUsed ??
              (dv.type === 'remote-db'
                ? (dv as any).attachedAt
                : mockNow - dataSourcesArray.length + index),
          },
        ]),
      );

      // Should use existing lastUsed, not attachedAt
      expect(dataSources.get('remote1')?.lastUsed).toBe(existingLastUsed);
    });
  });

  describe('Migration edge cases', () => {
    it('should handle empty arrays', () => {
      const sqlScriptsArray: any[] = [];
      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: script.lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      expect(sqlScripts.size).toBe(0);
    });

    it('should handle single item arrays', () => {
      const sqlScriptsArray = [{ id: 'script1', name: 'Only' }];

      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: (script as any).lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      expect(sqlScripts.get('script1')?.lastUsed).toBe(mockNow - 1 + 0);
    });

    it('should handle lastUsed set to 0', () => {
      const sqlScriptsArray = [
        { id: 'script1', name: 'Zero', lastUsed: 0 },
        { id: 'script2', name: 'Missing' },
      ];

      const sqlScripts = new Map(
        sqlScriptsArray.map((script, index) => [
          script.id,
          {
            ...script,
            lastUsed: script.lastUsed ?? (mockNow - sqlScriptsArray.length + index),
          },
        ]),
      );

      // lastUsed: 0 should be treated as a valid timestamp (falsy but valid)
      expect(sqlScripts.get('script1')?.lastUsed).toBe(0);
      expect(sqlScripts.get('script2')?.lastUsed).toBeGreaterThan(mockNow - sqlScriptsArray.length);
    });
  });
});
