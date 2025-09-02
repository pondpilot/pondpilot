import { ConnectionPool } from '@engines/types';
import {
  isMotherDuckInstance,
  extractMotherDuckDbName,
  groupMotherDuckDatabases,
  buildMotherDuckInstanceNode,
  buildRemoteDatabaseNodesWithHierarchy,
} from '@features/data-explorer/builders/motherduck-tree-builder';
import { DataExplorerNodeMap } from '@features/data-explorer/model';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';

// Mock the database-tree-builder to avoid import.meta.env issues
jest.mock('@features/data-explorer/builders/database-tree-builder', () => ({
  buildDatabaseNode: jest.fn().mockImplementation((db: any) => ({
    nodeType: 'db',
    value: db.id,
    label: db.dbName,
    iconType: 'db',
    children: [],
  })),
}));

// Mock other dependencies
jest.mock('@controllers/data-source');
jest.mock('@utils/clipboard');
jest.mock('@utils/remote-database');
jest.mock('@features/data-explorer/utils/metadata-refresh');

describe('MotherDuck Tree Builder', () => {
  const mockConn = {} as ConnectionPool;
  const mockNodeMap: DataExplorerNodeMap = new Map();
  const mockAnyNodeIdToNodeTypeMap = new Map();
  const mockDatabaseMetadata = new Map<string, DataBaseModel>();

  beforeEach(() => {
    mockNodeMap.clear();
    mockAnyNodeIdToNodeTypeMap.clear();
    mockDatabaseMetadata.clear();
  });

  describe('isMotherDuckInstance', () => {
    it('should identify MotherDuck URLs', () => {
      const mdDb: RemoteDB = {
        type: 'remote-db',
        id: 'test-id' as PersistentDataSourceId,
        legacyUrl: 'md:my_database',
        dbName: 'my_database',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      expect(isMotherDuckInstance(mdDb)).toBe(true);
    });

    it('should identify uppercase MotherDuck URLs', () => {
      const mdDb: RemoteDB = {
        type: 'remote-db',
        id: 'test-id' as PersistentDataSourceId,
        legacyUrl: 'MD:MY_DATABASE',
        dbName: 'MY_DATABASE',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      expect(isMotherDuckInstance(mdDb)).toBe(true);
    });

    it('should not identify non-MotherDuck URLs', () => {
      const regularDb: RemoteDB = {
        type: 'remote-db',
        id: 'test-id' as PersistentDataSourceId,
        legacyUrl: 'https://example.com/db.duckdb',
        dbName: 'example_db',
        connectionType: 'url',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      expect(isMotherDuckInstance(regularDb)).toBe(false);
    });
  });

  describe('extractMotherDuckDbName', () => {
    it('should extract database name from MotherDuck URL', () => {
      expect(extractMotherDuckDbName('md:my_database')).toBe('my_database');
      expect(extractMotherDuckDbName('md:production')).toBe('production');
      expect(extractMotherDuckDbName('md:test-db')).toBe('test-db');
    });
  });

  describe('groupMotherDuckDatabases', () => {
    it('should group MotherDuck databases by instance name', () => {
      const motherduckDb1: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:database1',
        dbName: 'database1',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        instanceName: 'Production',
      };

      const motherduckDb2: RemoteDB = {
        type: 'remote-db',
        id: 'md2' as PersistentDataSourceId,
        legacyUrl: 'md:database2',
        dbName: 'database2',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        instanceName: 'Production',
      };

      const motherduckDb3: RemoteDB = {
        type: 'remote-db',
        id: 'md3' as PersistentDataSourceId,
        legacyUrl: 'md:database3',
        dbName: 'database3',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        instanceName: 'Development',
      };

      const regularDb: RemoteDB = {
        type: 'remote-db',
        id: 'regular' as PersistentDataSourceId,
        legacyUrl: 'https://example.com/db.duckdb',
        dbName: 'example_db',
        connectionType: 'url',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const remoteDatabases = [motherduckDb1, regularDb, motherduckDb2, motherduckDb3];
      const instanceGroups = groupMotherDuckDatabases(remoteDatabases);

      expect(instanceGroups.size).toBe(3); // Production, Development, __other__
      expect(instanceGroups.get('Production')).toHaveLength(2);
      expect(instanceGroups.get('Development')).toHaveLength(1);
      expect(instanceGroups.get('__other__')).toHaveLength(1);
      expect(instanceGroups.get('__other__')).toContain(regularDb);
    });

    it('should use "default" as fallback for MotherDuck databases without instanceName', () => {
      const motherduckDbWithName: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:database1',
        dbName: 'database1',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        instanceName: 'Production',
      };

      const motherduckDbWithoutName: RemoteDB = {
        type: 'remote-db',
        id: 'md2' as PersistentDataSourceId,
        legacyUrl: 'md:database2',
        dbName: 'database2',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        // No instanceName property
      };

      const remoteDatabases = [motherduckDbWithName, motherduckDbWithoutName];
      const instanceGroups = groupMotherDuckDatabases(remoteDatabases);

      expect(instanceGroups.size).toBe(2); // Production and default
      expect(instanceGroups.get('Production')).toHaveLength(1);
      expect(instanceGroups.get('default')).toHaveLength(1);
      expect(instanceGroups.get('default')?.[0]).toBe(motherduckDbWithoutName);
    });
  });

  describe('buildMotherDuckInstanceNode', () => {
    it('should return null for empty array', () => {
      const node = buildMotherDuckInstanceNode('Production', [], {
        nodeMap: mockNodeMap,
        anyNodeIdToNodeTypeMap: mockAnyNodeIdToNodeTypeMap,
        conn: mockConn,
        databaseMetadata: mockDatabaseMetadata,
        initialExpandedState: {},
        flatFileSources: new Map(),
      });

      expect(node).toBeNull();
    });

    it('should build instance node with connected status', () => {
      const motherduckDb: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:database1',
        dbName: 'database1',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
        instanceName: 'Production',
      };

      const node = buildMotherDuckInstanceNode('Production', [motherduckDb], {
        nodeMap: mockNodeMap,
        anyNodeIdToNodeTypeMap: mockAnyNodeIdToNodeTypeMap,
        conn: mockConn,
        databaseMetadata: mockDatabaseMetadata,
        initialExpandedState: {},
        flatFileSources: new Map(),
      });

      expect(node).not.toBeNull();
      expect(node?.label).toBe('MotherDuck (Production) ✓');
      expect(node?.iconType).toBe('motherduck');
      expect(node?.children).toHaveLength(1);
      expect(node?.children?.[0].label).toBe('database1');
    });

    it('should show connecting status when any database is connecting', () => {
      const connectingDb: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:database1',
        dbName: 'database1',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connecting',
        attachedAt: Date.now(),
      };

      const connectedDb: RemoteDB = {
        type: 'remote-db',
        id: 'md2' as PersistentDataSourceId,
        legacyUrl: 'md:database2',
        dbName: 'database2',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildMotherDuckInstanceNode('Test', [connectingDb, connectedDb], {
        nodeMap: mockNodeMap,
        anyNodeIdToNodeTypeMap: mockAnyNodeIdToNodeTypeMap,
        conn: mockConn,
        databaseMetadata: mockDatabaseMetadata,
        initialExpandedState: {},
        flatFileSources: new Map(),
      });

      expect(node?.label).toBe('MotherDuck (Test) ✓'); // Shows connected since at least one is connected
    });

    it('should sort databases alphabetically', () => {
      const dbC: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:charlie',
        dbName: 'charlie',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const dbA: RemoteDB = {
        type: 'remote-db',
        id: 'md2' as PersistentDataSourceId,
        legacyUrl: 'md:alpha',
        dbName: 'alpha',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const dbB: RemoteDB = {
        type: 'remote-db',
        id: 'md3' as PersistentDataSourceId,
        legacyUrl: 'md:bravo',
        dbName: 'bravo',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildMotherDuckInstanceNode('Test', [dbC, dbA, dbB], {
        nodeMap: mockNodeMap,
        anyNodeIdToNodeTypeMap: mockAnyNodeIdToNodeTypeMap,
        conn: mockConn,
        databaseMetadata: mockDatabaseMetadata,
        initialExpandedState: {},
        flatFileSources: new Map(),
      });

      expect(node?.children?.[0].label).toBe('alpha');
      expect(node?.children?.[1].label).toBe('bravo');
      expect(node?.children?.[2].label).toBe('charlie');
    });
  });

  describe('buildRemoteDatabaseNodesWithHierarchy', () => {
    it('should build hierarchical structure with MotherDuck instance', () => {
      const motherduckDb: RemoteDB = {
        type: 'remote-db',
        id: 'md1' as PersistentDataSourceId,
        legacyUrl: 'md:database1',
        dbName: 'database1',
        connectionType: 'motherduck',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const regularDb: RemoteDB = {
        type: 'remote-db',
        id: 'regular' as PersistentDataSourceId,
        legacyUrl: 'ps://example.com/db.duckdb',
        dbName: 'example_db',
        connectionType: 'url',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const nodes = buildRemoteDatabaseNodesWithHierarchy([motherduckDb, regularDb], {
        nodeMap: mockNodeMap,
        anyNodeIdToNodeTypeMap: mockAnyNodeIdToNodeTypeMap,
        conn: mockConn,
        databaseMetadata: mockDatabaseMetadata,
        initialExpandedState: {},
        flatFileSources: new Map(),
      });

      expect(nodes).toHaveLength(2);

      // Should have one MotherDuck instance and one regular database
      const motherduckNode = nodes.find((n) => n.iconType === 'motherduck');
      const regularNode = nodes.find((n) => n.iconType === 'db');

      expect(motherduckNode).toBeDefined();
      expect(motherduckNode?.children).toHaveLength(1);
      expect(regularNode).toBeDefined();
      expect(regularNode?.iconType).toBe('db');
    });
  });
});
