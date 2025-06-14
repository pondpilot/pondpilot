// Import mocked functions
import { deleteDataSources } from '@controllers/data-source';
import { renameFile, renameXlsxFile } from '@controllers/file-explorer';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateSchemaBrowserTab } from '@controllers/tab';
import {
  buildFolderNode,
  buildXlsxFileNode,
  buildFileNode,
  buildDatabaseFileNode,
} from '@features/data-explorer/builders/file-system-node-builder';
import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '@features/data-explorer/model';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AnyFlatFileDataSource, XlsxSheetView, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { copyToClipboard } from '@utils/clipboard';
import {
  getFlatFileDataSourceIcon,
  getFlatFileDataSourceName,
  getFolderName,
  getLocalEntryIcon,
  getXlsxFileName,
} from '@utils/navigation';

// Mock external dependencies
jest.mock('@controllers/data-source');
jest.mock('@controllers/file-explorer');
jest.mock('@controllers/file-system');
jest.mock('@controllers/sql-script');
jest.mock('@controllers/tab');
jest.mock('@utils/clipboard');
jest.mock('@utils/navigation');

describe('file-system-node-builder', () => {
  let mockContext: {
    nodeMap: DataExplorerNodeMap;
    anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
    conn: AsyncDuckDBConnectionPool;
    dataSourceByFileId: Map<LocalEntryId, AnyFlatFileDataSource>;
    flatFileSourcesValues: AnyFlatFileDataSource[];
    nonLocalDBFileEntries: LocalEntry[];
    xlsxSheetsByFileId: Map<LocalEntryId, XlsxSheetView[]>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      nodeMap: new Map(),
      anyNodeIdToNodeTypeMap: new Map(),
      conn: {} as AsyncDuckDBConnectionPool,
      dataSourceByFileId: new Map(),
      flatFileSourcesValues: [],
      nonLocalDBFileEntries: [],
      xlsxSheetsByFileId: new Map(),
    };

    // Setup default mock returns
    (getFolderName as jest.Mock).mockImplementation((entry) => entry.name || entry.uniqueAlias);
    (getLocalEntryIcon as jest.Mock).mockReturnValue('folder');
    (getFlatFileDataSourceName as jest.Mock).mockImplementation((source) => source.viewName);
    (getFlatFileDataSourceIcon as jest.Mock).mockImplementation((source) => source.type);
    (getXlsxFileName as jest.Mock).mockImplementation((entry) => entry.uniqueAlias);
  });

  describe('buildFolderNode', () => {
    it('should build a folder node with correct properties', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'Documents',
        uniqueAlias: 'Documents',
        localPath: '/path/to/documents',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const buildChildren = jest.fn().mockReturnValue([]);

      const node = buildFolderNode(folderEntry, mockContext, buildChildren);

      expect(node).toMatchObject({
        nodeType: 'folder',
        value: 'folder-123',
        label: 'Documents',
        iconType: 'folder',
        isDisabled: false,
        isSelectable: false,
      });

      expect(buildChildren).toHaveBeenCalled();
    });

    it('should throw error if entry is not a directory', () => {
      const fileEntry: LocalEntry = {
        id: 'file-123' as LocalEntryId,
        name: 'file.csv',
        uniqueAlias: 'file.csv',
        localPath: '/path/to/file.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      expect(() => buildFolderNode(fileEntry, mockContext, () => [])).toThrow(
        'Entry must be a folder',
      );
    });

    it('should enable deletion for user-added folders', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'My Folder',
        uniqueAlias: 'My Folder',
        localPath: '/path/to/folder',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);

      expect(node.onDelete).toBeDefined();
      node.onDelete?.();
      expect(deleteLocalFileOrFolders).toHaveBeenCalledWith(mockContext.conn, ['folder-123']);
    });

    it('should not enable deletion for non-user-added folders', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'System Folder',
        uniqueAlias: 'System Folder',
        localPath: '/path/to/system',
        kind: 'directory',
        entryType: 'folder',
        userAdded: false,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);

      expect(node.onDelete).toBeUndefined();
    });

    it('should have context menu with copy and schema options', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'My Folder',
        uniqueAlias: 'My-Folder',
        localPath: '/path/to/folder',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);
      const menuItems = node.contextMenu?.[0].children || [];

      expect(menuItems).toHaveLength(2);

      // Test Copy name
      const copyItem = menuItems.find((item) => item.label === 'Copy name');
      copyItem?.onClick?.();
      expect(copyToClipboard).toHaveBeenCalledWith('My-Folder', { showNotification: true });

      // Test Show Schema
      const schemaItem = menuItems.find((item) => item.label === 'Show Schema');
      schemaItem?.onClick?.();
      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: 'folder-123',
        sourceType: 'folder',
        setActive: true,
      });
    });

    it('should register node in maps', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'Folder',
        uniqueAlias: 'Folder',
        localPath: '/path',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      buildFolderNode(folderEntry, mockContext, () => []);

      expect(mockContext.nodeMap.get('folder-123')).toEqual({
        entryId: 'folder-123',
        isSheet: false,
        sheetName: null,
      });
      expect(mockContext.anyNodeIdToNodeTypeMap.get('folder-123')).toBe('folder');
    });

    it('should build children through callback', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'Parent',
        uniqueAlias: 'Parent',
        localPath: '/parent',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const childNodes = [
        { nodeType: 'file' as const, value: 'file-1', label: 'file1.csv' },
        { nodeType: 'folder' as const, value: 'folder-2', label: 'Subfolder' },
      ];

      const buildChildren = jest.fn().mockReturnValue(childNodes);

      const node = buildFolderNode(folderEntry, mockContext, buildChildren);

      expect(node.children).toEqual(childNodes);
    });
  });

  describe('buildXlsxFileNode', () => {
    it('should build XLSX file node with sheet children', () => {
      const xlsxEntry: LocalEntry = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data.xlsx',
        uniqueAlias: 'data.xlsx',
        localPath: '/path/to/data.xlsx',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-file',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
      };

      const sheets: XlsxSheetView[] = [
        { id: 'sheet-1' as PersistentDataSourceId, sheetName: 'Sheet1', viewName: 'sheet1_view' },
        { id: 'sheet-2' as PersistentDataSourceId, sheetName: 'Sheet2', viewName: 'sheet2_view' },
      ];

      const node = buildXlsxFileNode(xlsxEntry, source, sheets, mockContext);

      expect(node).toMatchObject({
        nodeType: 'file',
        value: 'xlsx-123',
        label: 'data.xlsx',
        isSelectable: false,
      });

      expect(node.children).toHaveLength(2);
      expect(node.children?.[0]).toMatchObject({
        nodeType: 'sheet',
        label: 'Sheet1',
        iconType: 'xlsx-sheet',
      });
    });

    it('should throw error if entry is not a file', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'folder',
        uniqueAlias: 'folder',
        localPath: '/path',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-file',
        viewName: 'data_xlsx',
        fileSourceId: 'folder-123' as LocalEntryId,
      };

      expect(() => buildXlsxFileNode(folderEntry, source, [], mockContext)).toThrow(
        'Entry must be a file',
      );
    });

    it('should sort sheets alphabetically', () => {
      const xlsxEntry: LocalEntry = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data.xlsx',
        uniqueAlias: 'data.xlsx',
        localPath: '/path/to/data.xlsx',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-file',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
      };

      const sheets: XlsxSheetView[] = [
        { id: 'sheet-z' as PersistentDataSourceId, sheetName: 'Zebra', viewName: 'zebra_view' },
        { id: 'sheet-a' as PersistentDataSourceId, sheetName: 'Alpha', viewName: 'alpha_view' },
        { id: 'sheet-m' as PersistentDataSourceId, sheetName: 'Middle', viewName: 'middle_view' },
      ];

      const node = buildXlsxFileNode(xlsxEntry, source, sheets, mockContext);

      expect(node.children?.[0].label).toBe('Alpha');
      expect(node.children?.[1].label).toBe('Middle');
      expect(node.children?.[2].label).toBe('Zebra');
    });

    it('should enable renaming for XLSX files', () => {
      const xlsxEntry: LocalEntry = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data.xlsx',
        uniqueAlias: 'my_data',
        localPath: '/path/to/data.xlsx',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-file',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
      };

      const node = buildXlsxFileNode(xlsxEntry, source, [], mockContext);

      expect(node.renameCallbacks).toBeDefined();
      expect(node.renameCallbacks?.prepareRenameValue()).toBe('my_data');

      // Test rename submit
      node.renameCallbacks?.onRenameSubmit(node, 'new_name');
      expect(renameXlsxFile).toHaveBeenCalledWith('xlsx-123', 'new_name', mockContext.conn);
    });
  });

  describe('buildFileNode', () => {
    it('should build regular file node for CSV', () => {
      const csvEntry: LocalEntry = {
        id: 'csv-123' as LocalEntryId,
        name: 'data.csv',
        uniqueAlias: 'data.csv',
        localPath: '/path/to/data.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'data_csv',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);

      expect(node).toMatchObject({
        nodeType: 'file',
        value: 'csv-123',
        label: 'data_csv',
        iconType: 'csv',
        isSelectable: true,
      });
    });

    it('should enable renaming for regular files', () => {
      const csvEntry: LocalEntry = {
        id: 'csv-123' as LocalEntryId,
        name: 'data.csv',
        uniqueAlias: 'data.csv',
        localPath: '/path/to/data.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'old_view_name',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);

      expect(node.renameCallbacks).toBeDefined();
      expect(node.renameCallbacks?.prepareRenameValue()).toBe('old_view_name');

      // Test rename submit
      node.renameCallbacks?.onRenameSubmit(node, 'new_view_name');
      expect(renameFile).toHaveBeenCalledWith('ds-123', 'new_view_name', mockContext.conn);
    });

    it('should enable deletion for user-added files', () => {
      const csvEntry: LocalEntry = {
        id: 'csv-123' as LocalEntryId,
        name: 'data.csv',
        uniqueAlias: 'data.csv',
        localPath: '/path/to/data.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'data_csv',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);

      expect(node.onDelete).toBeDefined();
      node.onDelete?.();
      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, ['ds-123']);
    });

    it('should have comprehensive context menu', () => {
      const csvEntry: LocalEntry = {
        id: 'csv-123' as LocalEntryId,
        name: 'data.csv',
        uniqueAlias: 'data.csv',
        localPath: '/path/to/data.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'data_csv',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      expect(menuItems).toHaveLength(3);
      expect(menuItems.map((item) => item.label)).toEqual([
        'Copy Full Name',
        'Create a Query',
        'Show Schema',
      ]);

      // Test Create a Query
      (createSQLScript as jest.Mock).mockReturnValue({ id: 'script-123' });
      const queryItem = menuItems.find((item) => item.label === 'Create a Query');
      queryItem?.onClick?.();
      expect(createSQLScript).toHaveBeenCalledWith(
        'data_csv_query',
        'SELECT * FROM main.data_csv;',
      );
    });
  });

  describe('buildDatabaseFileNode', () => {
    it('should build database file node with special styling', () => {
      const dbEntry: LocalEntry = {
        id: 'db-123' as LocalEntryId,
        name: 'database.duckdb',
        uniqueAlias: 'database.duckdb',
        localPath: '/path/to/database.duckdb',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const node = buildDatabaseFileNode(dbEntry, mockContext);

      expect(node).toMatchObject({
        nodeType: 'file',
        value: 'db-123',
        label: '[DB] database.duckdb',
        iconType: 'db',
        isSelectable: false,
        doNotExpandOnClick: true,
        tooltip: 'Find in the Local Databases section',
      });
    });

    it('should throw error if entry is not a file', () => {
      const folderEntry: LocalEntry = {
        id: 'folder-123' as LocalEntryId,
        name: 'folder',
        uniqueAlias: 'folder',
        localPath: '/path',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      expect(() => buildDatabaseFileNode(folderEntry, mockContext)).toThrow('Entry must be a file');
    });

    it('should not have deletion or context menu', () => {
      const dbEntry: LocalEntry = {
        id: 'db-123' as LocalEntryId,
        name: 'database.duckdb',
        uniqueAlias: 'database.duckdb',
        localPath: '/path/to/database.duckdb',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const node = buildDatabaseFileNode(dbEntry, mockContext);

      expect(node.onDelete).toBeUndefined();
      expect(node.contextMenu).toEqual([]);
    });

    it('should register in node maps', () => {
      const dbEntry: LocalEntry = {
        id: 'db-123' as LocalEntryId,
        name: 'database.duckdb',
        uniqueAlias: 'database.duckdb',
        localPath: '/path/to/database.duckdb',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      buildDatabaseFileNode(dbEntry, mockContext);

      expect(mockContext.nodeMap.get('db-123')).toEqual({
        entryId: 'db-123',
        isSheet: false,
        sheetName: null,
      });
      expect(mockContext.anyNodeIdToNodeTypeMap.get('db-123')).toBe('file');
    });
  });

  describe('nested folder handling', () => {
    it('should handle deeply nested folder structures', () => {
      const rootFolder: LocalEntry = {
        id: 'root' as LocalEntryId,
        name: 'Root',
        uniqueAlias: 'Root',
        localPath: '/root',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const childFolder: LocalEntry = {
        id: 'child' as LocalEntryId,
        name: 'Child',
        uniqueAlias: 'Child',
        localPath: '/root/child',
        kind: 'directory',
        entryType: 'folder',
        userAdded: true,
      };

      const leafFile: LocalEntry = {
        id: 'file' as LocalEntryId,
        name: 'leaf.csv',
        uniqueAlias: 'leaf.csv',
        localPath: '/root/child/leaf.csv',
        kind: 'file',
        entryType: 'file',
        userAdded: true,
      };

      const fileSource: AnyFlatFileDataSource = {
        id: 'ds-leaf' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'leaf_csv',
        fileSourceId: 'file' as LocalEntryId,
      };

      // Build from leaf up
      const leafNode = buildFileNode(leafFile, fileSource, mockContext);
      const childNode = buildFolderNode(childFolder, mockContext, () => [leafNode]);
      const rootNode = buildFolderNode(rootFolder, mockContext, () => [childNode]);

      expect(rootNode.children).toHaveLength(1);
      expect(rootNode.children?.[0]).toBe(childNode);
      expect(childNode.children).toHaveLength(1);
      expect(childNode.children?.[0]).toBe(leafNode);
    });
  });
});
