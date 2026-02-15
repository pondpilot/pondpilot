import { deleteDataSources } from '@controllers/data-source';
import { renameDB } from '@controllers/db-explorer';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { buildSchemaTreeNode } from '@features/data-explorer/builders/database-node-builder';
import { buildDatabaseNode } from '@features/data-explorer/builders/database-tree-builder';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '@features/data-explorer/model';
import { refreshDatabaseMetadata } from '@features/data-explorer/utils/metadata-refresh';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LocalDB, RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { LocalEntry, LocalEntryId, LocalFile } from '@models/file-system';
// Import mocked functions
import { copyToClipboard } from '@utils/clipboard';
import { reconnectRemoteDatabase, disconnectRemoteDatabase } from '@utils/remote-database';

// Mock external dependencies
jest.mock('@controllers/data-source');
jest.mock('@controllers/db-explorer');
jest.mock('@controllers/tab');
jest.mock('@utils/clipboard');
jest.mock('@utils/remote-database');
jest.mock('@features/data-explorer/builders/database-node-builder', () => ({
  buildSchemaTreeNode: jest.fn().mockImplementation(({ schema }: any) => ({
    nodeType: 'schema',
    value: `schema-${schema.name}`,
    label: schema.name,
  })),
}));
jest.mock('@features/data-explorer/utils/metadata-refresh');

describe('buildDatabaseNode', () => {
  let mockContext: {
    nodeMap: DataExplorerNodeMap;
    anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
    conn: AsyncDuckDBConnectionPool;
    localDatabases: LocalDB[];
    localDBLocalEntriesMap: Map<LocalEntryId, LocalEntry>;
    databaseMetadata: Map<string, DataBaseModel>;
    fileViewNames?: Set<string>;
    initialExpandedState: Record<string, boolean>;
    flatFileSources?: Map<PersistentDataSourceId, any>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      nodeMap: new Map(),
      anyNodeIdToNodeTypeMap: new Map(),
      conn: {} as AsyncDuckDBConnectionPool,
      localDatabases: [],
      localDBLocalEntriesMap: new Map(),
      databaseMetadata: new Map(),
      fileViewNames: new Set(),
      initialExpandedState: {},
      flatFileSources: new Map(),
    };
  });

  describe('system database node building', () => {
    it('should build system database node with PondPilot label', () => {
      const systemDb: LocalDB = {
        id: 'system-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: PERSISTENT_DB_NAME,
        fileSourceId: '' as LocalEntryId,
      };

      const metadata: DataBaseModel = {
        name: PERSISTENT_DB_NAME,
        schemas: [
          { name: 'main', objects: [] },
          { name: 'information_schema', objects: [] },
        ],
      };

      mockContext.databaseMetadata.set(PERSISTENT_DB_NAME, metadata);

      const node = buildDatabaseNode(systemDb, true, mockContext);

      expect(node.label).toBe('PondPilot');
      expect(node.iconType).toBe('duck');
      expect(node.onDelete).toBeUndefined();
      expect(node.renameCallbacks).toBeUndefined();
    });

    it('should pass fileViewNames to schema builder for system database', () => {
      const systemDb: LocalDB = {
        id: 'system-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: PERSISTENT_DB_NAME,
        fileSourceId: '' as LocalEntryId,
      };

      const metadata: DataBaseModel = {
        name: PERSISTENT_DB_NAME,
        schemas: [{ name: 'main', objects: [] }],
      };

      mockContext.databaseMetadata.set(PERSISTENT_DB_NAME, metadata);
      mockContext.fileViewNames = new Set(['view1', 'view2']);

      buildDatabaseNode(systemDb, true, mockContext);

      expect(buildSchemaTreeNode).toHaveBeenCalledWith(
        expect.objectContaining({
          fileViewNames: mockContext.fileViewNames,
          conn: mockContext.conn,
        }),
      );
    });
  });

  describe('local database nodes', () => {
    it('should build local database node with file name', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: 'file-123' as LocalEntryId,
      };

      const localEntry: LocalFile = {
        kind: 'file',
        id: 'file-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
        uniqueAlias: 'database_123',
      };

      mockContext.localDBLocalEntriesMap.set('file-123' as LocalEntryId, localEntry);
      mockContext.localDatabases.push(localDb);

      const node = buildDatabaseNode(localDb, false, mockContext);

      expect(node.label).toBe('my_database (database)');
      expect(node.iconType).toBe('db');
    });

    it('should enable deletion for user-added local databases', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: 'file-123' as LocalEntryId,
      };

      const localEntry: LocalFile = {
        kind: 'file',
        id: 'file-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
        uniqueAlias: 'database_123',
      };

      mockContext.localDBLocalEntriesMap.set('file-123' as LocalEntryId, localEntry);

      const node = buildDatabaseNode(localDb, false, mockContext);

      expect(node.onDelete).toBeDefined();

      // Test delete callback
      if (node.onDelete) {
        node.onDelete(node);
        expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, ['local-db']);
      }
    });

    it('should enable renaming for user-added local databases', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: 'file-123' as LocalEntryId,
      };

      const localEntry: LocalFile = {
        kind: 'file',
        id: 'file-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
        uniqueAlias: 'database_123',
      };

      mockContext.localDBLocalEntriesMap.set('file-123' as LocalEntryId, localEntry);
      mockContext.localDatabases.push(localDb);

      const node = buildDatabaseNode(localDb, false, mockContext);

      expect(node.renameCallbacks).toBeDefined();
      expect(node.renameCallbacks?.prepareRenameValue?.(node)).toBe('my_database');

      // Test rename submit
      node.renameCallbacks?.onRenameSubmit(node, 'new_name');
      expect(renameDB).toHaveBeenCalledWith('local-db', 'new_name', mockContext.conn);
    });

    it('should not allow deletion for non-user-added databases', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: 'file-123' as LocalEntryId,
      };

      const localEntry: LocalFile = {
        kind: 'file',
        id: 'file-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        parentId: null,
        userAdded: false,
        handle: {} as FileSystemFileHandle,
        uniqueAlias: 'database_123',
      };

      mockContext.localDBLocalEntriesMap.set('file-123' as LocalEntryId, localEntry);

      const node = buildDatabaseNode(localDb, false, mockContext);

      expect(node.onDelete).toBeUndefined();
      expect(node.renameCallbacks).toBeUndefined();
    });
  });

  describe('remote database nodes', () => {
    it('should build remote database node with connection state', () => {
      const remoteDb: RemoteDB = {
        id: 'remote-db' as PersistentDataSourceId,
        type: 'remote-db',
        dbType: 'duckdb',
        dbName: 'remote_database',
        url: 'https://example.com/db.duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildDatabaseNode(remoteDb, false, mockContext);

      expect(node.label).toBe('remote_database ✓');
      expect(node.iconType).toBe('db');
      expect(node.onDelete).toBeDefined();
      expect(node.renameCallbacks).toBeUndefined();
    });

    it('should show different icons for different connection states', () => {
      const states = [
        { state: 'connected' as const, icon: '✓' },
        { state: 'connecting' as const, icon: '⟳' },
        { state: 'error' as const, icon: '⚠' },
        { state: 'disconnected' as const, icon: '✕' },
      ];

      states.forEach(({ state, icon }) => {
        const remoteDb: RemoteDB = {
          id: 'remote-db' as PersistentDataSourceId,
          type: 'remote-db',
          dbType: 'duckdb',
          dbName: 'remote_database',
          url: 'https://example.com/db.duckdb',
          connectionState: state,
          attachedAt: Date.now(),
        };

        const node = buildDatabaseNode(remoteDb, false, mockContext);
        expect(node.label).toBe(`remote_database ${icon}`);
      });
    });

    it('should have remote-specific context menu items', () => {
      const remoteDb: RemoteDB = {
        id: 'remote-db' as PersistentDataSourceId,
        type: 'remote-db',
        dbType: 'duckdb',
        dbName: 'remote_database',
        url: 'https://example.com/db.duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildDatabaseNode(remoteDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      // Should have Copy URL option
      const copyUrlItem = menuItems.find((item) => item.label === 'Copy URL');
      expect(copyUrlItem).toBeDefined();

      // Test Copy URL
      copyUrlItem?.onClick?.(node, {} as any);
      expect(copyToClipboard).toHaveBeenCalledWith('https://example.com/db.duckdb', {
        showNotification: true,
        notificationTitle: 'URL Copied',
      });
    });

    it('should show Refresh for connected remote databases', () => {
      const remoteDb: RemoteDB = {
        id: 'remote-db' as PersistentDataSourceId,
        type: 'remote-db',
        dbType: 'duckdb',
        dbName: 'remote_database',
        url: 'https://example.com/db.duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildDatabaseNode(remoteDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      const refreshItem = menuItems.find((item) => item.label === 'Refresh');
      expect(refreshItem).toBeDefined();

      // Test refresh
      refreshItem?.onClick?.(node, {} as any);
      expect(refreshDatabaseMetadata).toHaveBeenCalledWith(mockContext.conn, ['remote_database']);
    });

    it('should show Reconnect for disconnected remote databases', () => {
      const remoteDb: RemoteDB = {
        id: 'remote-db' as PersistentDataSourceId,
        type: 'remote-db',
        dbType: 'duckdb',
        dbName: 'remote_database',
        url: 'https://example.com/db.duckdb',
        connectionState: 'disconnected',
        attachedAt: Date.now(),
      };

      const node = buildDatabaseNode(remoteDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      const reconnectItem = menuItems.find((item) => item.label === 'Reconnect');
      expect(reconnectItem).toBeDefined();

      // Test reconnect
      reconnectItem?.onClick?.(node, {} as any);
      expect(reconnectRemoteDatabase).toHaveBeenCalledWith(mockContext.conn, remoteDb);
    });

    it('should show Disconnect for connected remote databases', () => {
      const remoteDb: RemoteDB = {
        id: 'remote-db' as PersistentDataSourceId,
        type: 'remote-db',
        dbType: 'duckdb',
        dbName: 'remote_database',
        url: 'https://example.com/db.duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const node = buildDatabaseNode(remoteDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      const disconnectItem = menuItems.find((item) => item.label === 'Disconnect');
      expect(disconnectItem).toBeDefined();

      // Test disconnect
      disconnectItem?.onClick?.(node, {} as any);
      expect(disconnectRemoteDatabase).toHaveBeenCalledWith(mockContext.conn, remoteDb);
    });
  });

  describe('context menu generation', () => {
    it('should have basic context menu items for all databases', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: '' as LocalEntryId,
      };

      const node = buildDatabaseNode(localDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      // Should have Copy name
      const copyNameItem = menuItems.find((item) => item.label === 'Copy name');
      expect(copyNameItem).toBeDefined();
      copyNameItem?.onClick?.(node, {} as any);
      expect(copyToClipboard).toHaveBeenCalledWith('my_database', {
        showNotification: true,
      });

      // Should have Show Schema
      const showSchemaItem = menuItems.find((item) => item.label === 'Show Schema');
      expect(showSchemaItem).toBeDefined();
    });

    it('should call getOrCreateSchemaBrowserTab with correct params', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: '' as LocalEntryId,
      };

      const metadata: DataBaseModel = {
        name: 'my_database',
        schemas: [
          { name: 'public', objects: [] },
          { name: 'main', objects: [] },
        ],
      };

      mockContext.databaseMetadata.set('my_database', metadata);

      const node = buildDatabaseNode(localDb, false, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];
      const showSchemaItem = menuItems.find((item) => item.label === 'Show Schema');

      showSchemaItem?.onClick?.(node, {} as any);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: 'local-db',
        sourceType: 'db',
        schemaName: 'main', // First schema after sorting
        setActive: true,
      });
    });
  });

  describe('node registration', () => {
    it('should register node in nodeMap and anyNodeIdToNodeTypeMap', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: '' as LocalEntryId,
      };

      buildDatabaseNode(localDb, false, mockContext);

      expect(mockContext.nodeMap.get('local-db')).toEqual({
        db: 'local-db',
        schemaName: null,
        objectName: null,
        columnName: null,
      });

      expect(mockContext.anyNodeIdToNodeTypeMap.get('local-db')).toBe('db');
    });
  });

  describe('schema children', () => {
    it('should build sorted schema children', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: '' as LocalEntryId,
      };

      const metadata: DataBaseModel = {
        name: 'my_database',
        schemas: [
          { name: 'zzz', objects: [] },
          { name: 'aaa', objects: [] },
          { name: 'mmm', objects: [] },
        ],
      };

      mockContext.databaseMetadata.set('my_database', metadata);

      const node = buildDatabaseNode(localDb, false, mockContext);

      expect(node.children).toHaveLength(3);
      expect(node.children?.[0].label).toBe('aaa');
      expect(node.children?.[1].label).toBe('mmm');
      expect(node.children?.[2].label).toBe('zzz');
    });

    it('should pass correct context to schema builder', () => {
      const localDb: LocalDB = {
        id: 'local-db' as PersistentDataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        dbName: 'my_database',
        fileSourceId: '' as LocalEntryId,
      };

      const metadata: DataBaseModel = {
        name: 'my_database',
        schemas: [{ name: 'public', objects: [] }],
      };

      mockContext.databaseMetadata.set('my_database', metadata);
      mockContext.initialExpandedState = { 'db-123': true };

      buildDatabaseNode(localDb, false, mockContext);

      expect(buildSchemaTreeNode).toHaveBeenCalledWith({
        nodeDbId: 'local-db',
        sourceDbId: 'local-db',
        dbName: 'my_database',
        schema: { name: 'public', objects: [] },
        fileViewNames: undefined,
        comparisonTableNames: undefined,
        conn: undefined,
        context: {
          nodeMap: mockContext.nodeMap,
          anyNodeIdToNodeTypeMap: mockContext.anyNodeIdToNodeTypeMap,
          flatFileSources: mockContext.flatFileSources,
          comparisonByTableName: undefined,
          comparisonTableNames: undefined,
        },
        initialExpandedState: mockContext.initialExpandedState,
      });
    });
  });
});
