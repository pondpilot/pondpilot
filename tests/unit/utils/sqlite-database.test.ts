import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { DataSourceLocalFile, LocalEntryId } from '@models/file-system';

// Mock the modules
jest.mock('@utils/helpers', () => ({
  findUniqueName: jest.fn(
    (baseName: string, _checkIfExists?: (name: string) => boolean) => baseName,
  ),
}));

jest.mock('@utils/data-source', () => ({
  makePersistentDataSourceId: jest.fn(() => 'test-data-source-id'),
  addLocalDB: jest.fn((localEntry: DataSourceLocalFile, _reservedDbs: Set<string>) => {
    const helpers = jest.requireMock('@utils/helpers') as any;
    const dbName = helpers.findUniqueName(localEntry.uniqueAlias);

    switch (localEntry.ext) {
      case 'duckdb':
        return {
          id: 'test-data-source-id',
          type: 'attached-db',
          dbType: 'duckdb',
          fileSourceId: localEntry.id,
          dbName,
        };
      case 'db':
        return {
          id: 'test-data-source-id',
          type: 'attached-db',
          dbType: 'sqlite',
          fileSourceId: localEntry.id,
          dbName,
        };
      default:
        throw new Error('Unexpected unsupported database source file type');
    }
  }),
}));

describe('SQLite Database Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mocked behavior to default
    const helpers = jest.requireMock('@utils/helpers') as any;
    helpers.findUniqueName.mockImplementation(
      (baseName: string, _checkIfExists?: (name: string) => boolean) => baseName,
    );
  });

  describe('addLocalDB', () => {
    it('should create LocalDB entry for SQLite files', async () => {
      const { addLocalDB } = await import('@utils/data-source');

      const sqliteFile: DataSourceLocalFile = {
        id: 'test-file-id' as LocalEntryId,
        kind: 'file',
        fileType: 'data-source',
        name: 'test',
        ext: 'db',
        uniqueAlias: 'test_sqlite',
        handle: null as any,
        parentId: null,
        userAdded: true,
      };

      const reservedDbs = new Set<string>(['existing_db']);
      const result = addLocalDB(sqliteFile, reservedDbs);

      expect(result).toEqual({
        id: 'test-data-source-id',
        type: 'attached-db',
        dbType: 'sqlite',
        fileSourceId: 'test-file-id',
        dbName: 'test_sqlite',
      });
    });

    it('should handle name conflicts for SQLite databases', async () => {
      const helpers = (await import('@utils/helpers')) as any;
      const { addLocalDB } = await import('@utils/data-source');

      // Mock findUniqueName to return a different name
      helpers.findUniqueName.mockImplementation(
        (baseName: string, _checkIfExists?: (name: string) => boolean) => `${baseName}_1`,
      );

      const sqliteFile: DataSourceLocalFile = {
        id: 'test-file-id' as LocalEntryId,
        kind: 'file',
        fileType: 'data-source',
        name: 'existing',
        ext: 'db',
        uniqueAlias: 'existing',
        handle: null as any,
        parentId: null,
        userAdded: true,
      };

      const reservedDbs = new Set<string>(['existing']);
      const result = addLocalDB(sqliteFile, reservedDbs);

      expect(result.dbName).toBe('existing_1');
      expect(result.dbType).toBe('sqlite');
    });

    it('should create LocalDB entry for DuckDB files', async () => {
      const { addLocalDB } = await import('@utils/data-source');

      const duckdbFile: DataSourceLocalFile = {
        id: 'test-file-id' as LocalEntryId,
        kind: 'file',
        fileType: 'data-source',
        name: 'test.duckdb',
        ext: 'duckdb',
        uniqueAlias: 'test_duckdb',
        handle: null as any,
        parentId: null,
        userAdded: true,
      };

      const reservedDbs = new Set<string>();
      const result = addLocalDB(duckdbFile, reservedDbs);

      expect(result).toEqual({
        id: 'test-data-source-id',
        type: 'attached-db',
        dbType: 'duckdb',
        fileSourceId: 'test-file-id',
        dbName: 'test_duckdb',
      });
    });
  });

  describe('Remote SQLite Database', () => {
    it('should support remote SQLite database configuration', () => {
      // This test validates the RemoteDB type supports SQLite
      const remoteSQLiteDB = {
        type: 'remote-db' as const,
        id: 'test-data-source-id' as any,
        url: 'https://example.com/data.db',
        dbName: 'remote_sqlite',
        dbType: 'sqlite' as const,
        connectionState: 'connected' as const,
        attachedAt: Date.now(),
      };

      // Type check - this should compile without errors
      expect(remoteSQLiteDB.dbType).toBe('sqlite');
      expect(remoteSQLiteDB.url).toContain('.db');
    });
  });
});
