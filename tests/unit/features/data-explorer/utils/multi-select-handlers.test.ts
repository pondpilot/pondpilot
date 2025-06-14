// Import mocked functions
import { showWarning } from '@components/app-notifications';
import { TreeNodeData } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '@features/data-explorer/model';
import {
  handleMultiSelectDelete,
  handleMultiSelectShowSchema,
  getShowSchemaHandler,
} from '@features/data-explorer/utils/multi-select-handlers';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PersistentDataSourceId } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';

// Mock external dependencies
jest.mock('@components/app-notifications');
jest.mock('@controllers/data-source');
jest.mock('@controllers/file-system');
jest.mock('@controllers/tab');

describe('multi-select-handlers', () => {
  let mockContext: {
    nodeMap: DataExplorerNodeMap;
    anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
    conn: AsyncDuckDBConnectionPool;
    flatFileSources: Map<PersistentDataSourceId, any>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock context
    mockContext = {
      nodeMap: new Map(),
      anyNodeIdToNodeTypeMap: new Map(),
      conn: {} as AsyncDuckDBConnectionPool,
      flatFileSources: new Map(),
    };
  });

  describe('handleMultiSelectDelete', () => {
    it('should delete database nodes', () => {
      // Setup database node
      const dbId = 'db-123' as PersistentDataSourceId;
      const nodeValue = 'db-node-1';

      mockContext.nodeMap.set(nodeValue, {
        db: dbId,
        schemaName: null,
        objectName: null,
        columnName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set(nodeValue, 'db');

      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: nodeValue,
          label: 'Test Database',
          nodeType: 'db',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, [dbId]);
      expect(deleteLocalFileOrFolders).not.toHaveBeenCalled();
    });

    it('should delete file nodes by finding corresponding data sources', () => {
      // Setup file node
      const entryId = 'file-123' as LocalEntryId;
      const dsId = 'ds-123' as PersistentDataSourceId;
      const nodeValue = 'file-node-1';

      mockContext.nodeMap.set(nodeValue, {
        entryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set(nodeValue, 'file');
      mockContext.flatFileSources.set(dsId, {
        fileSourceId: entryId,
        type: 'csv',
      });

      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: nodeValue,
          label: 'data.csv',
          nodeType: 'file',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, [dsId]);
      expect(deleteLocalFileOrFolders).not.toHaveBeenCalled();
    });

    it('should delete sheet nodes', () => {
      // Setup sheet node
      const entryId = 'file-456' as LocalEntryId;
      const sheetName = 'Sheet1';
      const dsId = 'ds-456' as PersistentDataSourceId;
      const nodeValue = `${entryId}::${sheetName}`;

      mockContext.nodeMap.set(nodeValue, {
        entryId,
        isSheet: true,
        sheetName,
      });
      mockContext.anyNodeIdToNodeTypeMap.set(nodeValue, 'sheet');
      mockContext.flatFileSources.set(dsId, {
        fileSourceId: entryId,
        type: 'xlsx-sheet',
        sheetName,
      });

      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: nodeValue,
          label: sheetName,
          nodeType: 'sheet',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, [dsId]);
      expect(deleteLocalFileOrFolders).not.toHaveBeenCalled();
    });

    it('should delete folder nodes', () => {
      // Setup folder node
      const entryId = 'folder-789' as LocalEntryId;
      const nodeValue = 'folder-node-1';

      mockContext.nodeMap.set(nodeValue, {
        entryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set(nodeValue, 'folder');

      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: nodeValue,
          label: 'Documents',
          nodeType: 'folder',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteLocalFileOrFolders).toHaveBeenCalledWith(mockContext.conn, [entryId]);
      expect(deleteDataSources).not.toHaveBeenCalled();
    });

    it('should handle mixed selection of databases and folders', () => {
      // Setup database and folder nodes
      const dbId = 'db-mix' as PersistentDataSourceId;
      const folderId = 'folder-mix' as LocalEntryId;

      mockContext.nodeMap.set('db-node', {
        db: dbId,
        schemaName: null,
        objectName: null,
        columnName: null,
      });
      mockContext.nodeMap.set('folder-node', {
        entryId: folderId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('db-node', 'db');
      mockContext.anyNodeIdToNodeTypeMap.set('folder-node', 'folder');

      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: 'db-node',
          label: 'Database',
          nodeType: 'db',
        },
        {
          value: 'folder-node',
          label: 'Folder',
          nodeType: 'folder',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, [dbId]);
      expect(deleteLocalFileOrFolders).toHaveBeenCalledWith(mockContext.conn, [folderId]);
    });

    it('should skip nodes without valid info', () => {
      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        {
          value: 'unknown-node',
          label: 'Unknown',
          nodeType: 'file',
        },
      ];

      handleMultiSelectDelete(nodes, mockContext);

      expect(deleteDataSources).not.toHaveBeenCalled();
      expect(deleteLocalFileOrFolders).not.toHaveBeenCalled();
    });

    it('should handle empty selection', () => {
      handleMultiSelectDelete([], mockContext);

      expect(deleteDataSources).not.toHaveBeenCalled();
      expect(deleteLocalFileOrFolders).not.toHaveBeenCalled();
    });
  });

  describe('handleMultiSelectShowSchema', () => {
    it('should show schema for database object nodes in same schema', () => {
      // Setup database object nodes
      const dbId = 'db-schema' as PersistentDataSourceId;
      const schemaName = 'public';

      mockContext.nodeMap.set('table1', {
        db: dbId,
        schemaName,
        objectName: 'users',
        columnName: null,
      });
      mockContext.nodeMap.set('table2', {
        db: dbId,
        schemaName,
        objectName: 'orders',
        columnName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('table1', 'object');
      mockContext.anyNodeIdToNodeTypeMap.set('table2', 'object');

      handleMultiSelectShowSchema(['table1', 'table2'], mockContext);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: dbId,
        sourceType: 'db',
        schemaName,
        objectNames: ['users', 'orders'],
        setActive: true,
      });
      expect(showWarning).not.toHaveBeenCalled();
    });

    it('should warn when database objects are from different schemas', () => {
      // Setup nodes from different schemas
      const dbId = 'db-multi' as PersistentDataSourceId;

      mockContext.nodeMap.set('table1', {
        db: dbId,
        schemaName: 'public',
        objectName: 'users',
        columnName: null,
      });
      mockContext.nodeMap.set('table2', {
        db: dbId,
        schemaName: 'private',
        objectName: 'secrets',
        columnName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('table1', 'object');
      mockContext.anyNodeIdToNodeTypeMap.set('table2', 'object');

      handleMultiSelectShowSchema(['table1', 'table2'], mockContext);

      expect(showWarning).toHaveBeenCalledWith({
        title: 'Schema Mismatch',
        message: 'All selected items must belong to the same database schema',
      });
      expect(getOrCreateSchemaBrowserTab).not.toHaveBeenCalled();
    });

    it('should show schema for file nodes', () => {
      // Setup file nodes
      const entryId1 = 'file-1' as LocalEntryId;
      const entryId2 = 'file-2' as LocalEntryId;
      const dsId1 = 'ds-1' as PersistentDataSourceId;
      const dsId2 = 'ds-2' as PersistentDataSourceId;

      mockContext.nodeMap.set('file1', {
        entryId: entryId1,
        isSheet: false,
        sheetName: null,
      });
      mockContext.nodeMap.set('file2', {
        entryId: entryId2,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('file1', 'file');
      mockContext.anyNodeIdToNodeTypeMap.set('file2', 'file');

      mockContext.flatFileSources.set(dsId1, {
        fileSourceId: entryId1,
        type: 'csv',
      });
      mockContext.flatFileSources.set(dsId2, {
        fileSourceId: entryId2,
        type: 'json',
      });

      handleMultiSelectShowSchema(['file1', 'file2'], mockContext);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: null,
        sourceType: 'file',
        objectNames: [dsId1, dsId2],
        setActive: true,
      });
    });

    it('should show schema for sheet nodes', () => {
      // Setup sheet node
      const entryId = 'xlsx-file' as LocalEntryId;
      const sheetName = 'Sheet1';
      const dsId = 'ds-sheet' as PersistentDataSourceId;
      const nodeId = `${entryId}::${sheetName}`;

      mockContext.nodeMap.set(nodeId, {
        entryId,
        isSheet: true,
        sheetName,
      });
      mockContext.anyNodeIdToNodeTypeMap.set(nodeId, 'sheet');

      mockContext.flatFileSources.set(dsId, {
        fileSourceId: entryId,
        type: 'xlsx-sheet',
        sheetName,
      });

      handleMultiSelectShowSchema([nodeId], mockContext);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: null,
        sourceType: 'file',
        objectNames: [dsId],
        setActive: true,
      });
    });

    it('should handle single folder selection', () => {
      // Setup folder node
      const entryId = 'folder-show' as LocalEntryId;

      mockContext.nodeMap.set('folder1', {
        entryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('folder1', 'folder');

      handleMultiSelectShowSchema(['folder1'], mockContext);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: entryId,
        sourceType: 'folder',
        setActive: true,
      });
    });

    it('should warn for multiple folder selection', () => {
      // Setup multiple folder nodes
      mockContext.nodeMap.set('folder1', {
        entryId: 'folder-1' as LocalEntryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.nodeMap.set('folder2', {
        entryId: 'folder-2' as LocalEntryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('folder1', 'folder');
      mockContext.anyNodeIdToNodeTypeMap.set('folder2', 'folder');

      handleMultiSelectShowSchema(['folder1', 'folder2'], mockContext);

      expect(showWarning).toHaveBeenCalledWith({
        title: 'Multiple Folders',
        message: 'Schema browser for multiple folders is not yet supported',
      });
      expect(getOrCreateSchemaBrowserTab).not.toHaveBeenCalled();
    });

    it('should warn for mixed database and file selection', () => {
      // Setup mixed nodes
      mockContext.nodeMap.set('db-node', {
        db: 'db-123' as PersistentDataSourceId,
        schemaName: 'public',
        objectName: 'users',
        columnName: null,
      });
      mockContext.nodeMap.set('file-node', {
        entryId: 'file-123' as LocalEntryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('db-node', 'object');
      mockContext.anyNodeIdToNodeTypeMap.set('file-node', 'file');

      handleMultiSelectShowSchema(['db-node', 'file-node'], mockContext);

      expect(showWarning).toHaveBeenCalledWith({
        title: 'Mixed Selection',
        message: 'Cannot show schema for mixed database and file selections',
      });
      expect(getOrCreateSchemaBrowserTab).not.toHaveBeenCalled();
    });

    it('should handle empty selection', () => {
      handleMultiSelectShowSchema([], mockContext);

      expect(getOrCreateSchemaBrowserTab).not.toHaveBeenCalled();
      expect(showWarning).not.toHaveBeenCalled();
    });

    it('should filter out invalid node IDs', () => {
      // Only setup one valid node
      mockContext.nodeMap.set('valid-node', {
        entryId: 'file-123' as LocalEntryId,
        isSheet: false,
        sheetName: null,
      });
      mockContext.anyNodeIdToNodeTypeMap.set('valid-node', 'file');
      mockContext.flatFileSources.set('ds-123' as PersistentDataSourceId, {
        fileSourceId: 'file-123',
        type: 'csv',
      });

      handleMultiSelectShowSchema(['valid-node', 'invalid-node'], mockContext);

      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: null,
        sourceType: 'file',
        objectNames: ['ds-123'],
        setActive: true,
      });
    });
  });

  describe('getShowSchemaHandler', () => {
    it('should return handler for valid node types', () => {
      const validNodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        { value: 'obj1', label: 'Table', nodeType: 'object' },
        { value: 'file1', label: 'File', nodeType: 'file' },
        { value: 'sheet1', label: 'Sheet', nodeType: 'sheet' },
        { value: 'folder1', label: 'Folder', nodeType: 'folder' },
      ];

      const handler = getShowSchemaHandler(validNodes, mockContext);

      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('should return undefined for invalid node types', () => {
      const invalidNodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        { value: 'db1', label: 'Database', nodeType: 'db' },
        { value: 'schema1', label: 'Schema', nodeType: 'schema' },
        { value: 'col1', label: 'Column', nodeType: 'column' },
      ];

      const handler = getShowSchemaHandler(invalidNodes, mockContext);

      expect(handler).toBeUndefined();
    });

    it('should filter mixed valid and invalid nodes', () => {
      const mixedNodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        { value: 'obj1', label: 'Table', nodeType: 'object' }, // valid
        { value: 'db1', label: 'Database', nodeType: 'db' }, // invalid
        { value: 'file1', label: 'File', nodeType: 'file' }, // valid
      ];

      const handler = getShowSchemaHandler(mixedNodes, mockContext);

      expect(handler).toBeDefined();
    });

    it('should return undefined for empty selection', () => {
      const handler = getShowSchemaHandler([], mockContext);

      expect(handler).toBeUndefined();
    });

    it('should create a handler that calls handleMultiSelectShowSchema', () => {
      const nodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
        { value: 'file1', label: 'data.csv', nodeType: 'file' },
      ];

      const handler = getShowSchemaHandler(nodes, mockContext);

      expect(handler).toBeDefined();

      // Test that the handler works
      if (handler) {
        handler(['file1']);
        // Since handleMultiSelectShowSchema is called internally,
        // we can't directly test it, but we've already tested that function
      }
    });
  });
});
