import { useDatabaseSeparation } from '@features/data-explorer/hooks/use-database-separation';
import { describe, it, expect, jest } from '@jest/globals';
import {
  AnyDataSource,
  LocalDB,
  RemoteDB,
  SYSTEM_DATABASE_ID,
  PersistentDataSourceId,
} from '@models/data-source';

// Import the hook after mocks are set up

// Mock React hooks
jest.mock('react', () => ({
  useMemo: jest.fn((fn) => fn()),
}));

describe('useDatabaseSeparation', () => {
  const createMockLocalDB = (id: string, name: string): LocalDB => ({
    id: id as PersistentDataSourceId,
    type: 'attached-db',
    dbType: 'duckdb',
    dbName: name,
    fileSourceId: 'file-1' as any,
    attachedAt: Date.now(),
  });

  const createMockRemoteDB = (id: string, name: string): RemoteDB => ({
    id: id as PersistentDataSourceId,
    type: 'remote-db',
    dbType: 'duckdb',
    dbName: name,
    url: `https://example.com/${name}`,
    connectionState: 'connected',
    attachedAt: Date.now(),
  });

  describe('basic separation', () => {
    it('should separate data sources into system, local, and remote databases', () => {
      const dataSources = new Map<string, AnyDataSource>([
        [SYSTEM_DATABASE_ID, createMockLocalDB(SYSTEM_DATABASE_ID, 'system')],
        ['local-1', createMockLocalDB('local-1', 'local-db-1')],
        ['local-2', createMockLocalDB('local-2', 'local-db-2')],
        ['remote-1', createMockRemoteDB('remote-1', 'remote-db-1')],
        ['remote-2', createMockRemoteDB('remote-2', 'remote-db-2')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      expect(result.systemDatabase).toBeDefined();
      expect(result.systemDatabase?.dbName).toBe('system');
      expect(result.localDatabases).toHaveLength(2);
      expect(result.remoteDatabases).toHaveLength(2);
      expect(result.localDatabases[0].dbName).toBe('local-db-1');
      expect(result.localDatabases[1].dbName).toBe('local-db-2');
      expect(result.remoteDatabases[0].dbName).toBe('remote-db-1');
      expect(result.remoteDatabases[1].dbName).toBe('remote-db-2');
    });

    it('should handle empty input', () => {
      const result = useDatabaseSeparation(new Map());

      expect(result.systemDatabase).toBeUndefined();
      expect(result.localDatabases).toHaveLength(0);
      expect(result.remoteDatabases).toHaveLength(0);
    });

    it('should handle only local databases', () => {
      const dataSources = new Map<string, AnyDataSource>([
        ['local-1', createMockLocalDB('local-1', 'alpha.db')],
        ['local-2', createMockLocalDB('local-2', 'beta.db')],
        ['local-3', createMockLocalDB('local-3', 'gamma.db')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      expect(result.systemDatabase).toBeUndefined();
      expect(result.localDatabases).toHaveLength(3);
      expect(result.remoteDatabases).toHaveLength(0);
      // Check sorting
      expect(result.localDatabases[0].dbName).toBe('alpha.db');
      expect(result.localDatabases[1].dbName).toBe('beta.db');
      expect(result.localDatabases[2].dbName).toBe('gamma.db');
    });

    it('should handle only remote databases', () => {
      const dataSources = new Map<string, AnyDataSource>([
        ['remote-1', createMockRemoteDB('remote-1', 'zebra.db')],
        ['remote-2', createMockRemoteDB('remote-2', 'alpha.db')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      expect(result.systemDatabase).toBeUndefined();
      expect(result.localDatabases).toHaveLength(0);
      expect(result.remoteDatabases).toHaveLength(2);
      // Check sorting
      expect(result.remoteDatabases[0].dbName).toBe('alpha.db');
      expect(result.remoteDatabases[1].dbName).toBe('zebra.db');
    });
  });

  describe('sorting', () => {
    it('should sort databases alphabetically by name', () => {
      const dataSources = new Map<string, AnyDataSource>([
        ['local-1', createMockLocalDB('local-1', 'zebra.db')],
        ['local-2', createMockLocalDB('local-2', 'alpha.db')],
        ['local-3', createMockLocalDB('local-3', 'middle.db')],
        ['remote-1', createMockRemoteDB('remote-1', 'zoo.db')],
        ['remote-2', createMockRemoteDB('remote-2', 'aardvark.db')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      // Local databases should be sorted
      expect(result.localDatabases[0].dbName).toBe('alpha.db');
      expect(result.localDatabases[1].dbName).toBe('middle.db');
      expect(result.localDatabases[2].dbName).toBe('zebra.db');

      // Remote databases should be sorted
      expect(result.remoteDatabases[0].dbName).toBe('aardvark.db');
      expect(result.remoteDatabases[1].dbName).toBe('zoo.db');
    });
  });

  describe('special cases', () => {
    it('should separate system database from regular local databases', () => {
      const dataSources = new Map<string, AnyDataSource>([
        [SYSTEM_DATABASE_ID, createMockLocalDB(SYSTEM_DATABASE_ID, 'system')],
        ['local-1', createMockLocalDB('local-1', 'user.db')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      expect(result.systemDatabase).toBeDefined();
      expect(result.systemDatabase?.id).toBe(SYSTEM_DATABASE_ID);
      expect(result.localDatabases).toHaveLength(1);
      expect(result.localDatabases[0].dbName).toBe('user.db');
    });

    it('should ignore non-database data sources', () => {
      const dataSources = new Map<string, AnyDataSource>([
        ['local-1', createMockLocalDB('local-1', 'test.db')],
        ['file-1', { type: 'file', id: 'file-1' } as any], // Non-database source
        ['remote-1', createMockRemoteDB('remote-1', 'remote.db')],
      ]);

      const result = useDatabaseSeparation(dataSources);

      expect(result.localDatabases).toHaveLength(1);
      expect(result.remoteDatabases).toHaveLength(1);
      expect(result.localDatabases[0].dbName).toBe('test.db');
      expect(result.remoteDatabases[0].dbName).toBe('remote.db');
    });
  });
});
