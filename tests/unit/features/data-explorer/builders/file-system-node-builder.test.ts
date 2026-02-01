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
import { LocalEntry, LocalEntryId, LocalFolder, LocalFile } from '@models/file-system';
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
    (getFolderName as jest.Mock).mockImplementation(
      (entry: any) => entry.name || entry.uniqueAlias,
    );
    (getLocalEntryIcon as jest.Mock).mockReturnValue('folder');
    (getFlatFileDataSourceName as jest.Mock).mockImplementation((source: any) => source.viewName);
    (getFlatFileDataSourceIcon as jest.Mock).mockImplementation((source: any) => source.type);
    (getXlsxFileName as jest.Mock).mockImplementation((entry: any) => entry.uniqueAlias);
  });

  describe('buildFolderNode', () => {
    it('should build a folder node with correct properties', () => {
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'Documents',
        uniqueAlias: 'Documents',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const buildChildren = jest.fn(() => []) as any;

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
      const fileEntry: LocalFile = {
        id: 'file-123' as LocalEntryId,
        name: 'file',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'file.csv',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      expect(() => buildFolderNode(fileEntry, mockContext, () => [])).toThrow(
        'Entry must be a folder',
      );
    });

    it('should enable deletion for user-added folders', () => {
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'My Folder',
        uniqueAlias: 'My Folder',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);

      expect(node.onDelete).toBeDefined();
      node.onDelete?.(node);
      expect(deleteLocalFileOrFolders).toHaveBeenCalledWith(mockContext.conn, ['folder-123']);
    });

    it('should not enable deletion for non-user-added folders', () => {
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'System Folder',
        uniqueAlias: 'System Folder',
        kind: 'directory',
        parentId: null,
        userAdded: false,
        handle: {} as FileSystemDirectoryHandle,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);

      expect(node.onDelete).toBeUndefined();
    });

    it('should have context menu with copy and schema options', () => {
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'My Folder',
        uniqueAlias: 'My-Folder',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const node = buildFolderNode(folderEntry, mockContext, () => []);
      const menuItems = node.contextMenu?.[0].children || [];

      expect(menuItems).toHaveLength(2);

      // Test Copy name
      const copyItem = menuItems.find((item) => item.label === 'Copy name');
      copyItem?.onClick?.(node, {} as any);
      expect(copyToClipboard).toHaveBeenCalledWith('My-Folder', { showNotification: true });

      // Test Show Schema
      const schemaItem = menuItems.find((item) => item.label === 'Show Schema');
      schemaItem?.onClick?.(node, {} as any);
      expect(getOrCreateSchemaBrowserTab).toHaveBeenCalledWith({
        sourceId: 'folder-123',
        sourceType: 'folder',
        setActive: true,
      });
    });

    it('should register node in maps', () => {
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'Folder',
        uniqueAlias: 'Folder',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
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
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'Parent',
        uniqueAlias: 'Parent',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const childNodes = [
        { nodeType: 'file' as const, value: 'file-1', label: 'file1.csv' },
        { nodeType: 'folder' as const, value: 'folder-2', label: 'Subfolder' },
      ];

      const buildChildren = jest.fn(() => childNodes) as any;

      const node = buildFolderNode(folderEntry, mockContext, buildChildren);

      expect(node.children).toEqual(childNodes);
    });
  });

  describe('buildXlsxFileNode', () => {
    it('should build XLSX file node with sheet children', () => {
      const xlsxEntry: LocalFile = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data',
        ext: 'xlsx',
        fileType: 'data-source',
        uniqueAlias: 'data.xlsx',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: XlsxSheetView = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-sheet',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
        sheetName: 'MainSheet',
      };

      const sheets: XlsxSheetView[] = [
        {
          id: 'sheet-1' as PersistentDataSourceId,
          type: 'xlsx-sheet',
          fileSourceId: 'xlsx-123' as LocalEntryId,
          sheetName: 'Sheet1',
          viewName: 'sheet1_view',
        },
        {
          id: 'sheet-2' as PersistentDataSourceId,
          type: 'xlsx-sheet',
          fileSourceId: 'xlsx-123' as LocalEntryId,
          sheetName: 'Sheet2',
          viewName: 'sheet2_view',
        },
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
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'folder',
        uniqueAlias: 'folder',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const source: XlsxSheetView = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-sheet',
        viewName: 'data_xlsx',
        fileSourceId: 'folder-123' as LocalEntryId,
        sheetName: 'Sheet1',
      };

      expect(() => buildXlsxFileNode(folderEntry, source, [], mockContext)).toThrow(
        'Entry must be a file',
      );
    });

    it('should sort sheets alphabetically', () => {
      const xlsxEntry: LocalFile = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data',
        ext: 'xlsx',
        fileType: 'data-source',
        uniqueAlias: 'data.xlsx',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: XlsxSheetView = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-sheet',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
        sheetName: 'MainSheet',
      };

      const sheets: XlsxSheetView[] = [
        {
          id: 'sheet-z' as PersistentDataSourceId,
          type: 'xlsx-sheet',
          fileSourceId: 'xlsx-123' as LocalEntryId,
          sheetName: 'Zebra',
          viewName: 'zebra_view',
        },
        {
          id: 'sheet-a' as PersistentDataSourceId,
          type: 'xlsx-sheet',
          fileSourceId: 'xlsx-123' as LocalEntryId,
          sheetName: 'Alpha',
          viewName: 'alpha_view',
        },
        {
          id: 'sheet-m' as PersistentDataSourceId,
          type: 'xlsx-sheet',
          fileSourceId: 'xlsx-123' as LocalEntryId,
          sheetName: 'Middle',
          viewName: 'middle_view',
        },
      ];

      const node = buildXlsxFileNode(xlsxEntry, source, sheets, mockContext);

      expect(node.children?.[0].label).toBe('Alpha');
      expect(node.children?.[1].label).toBe('Middle');
      expect(node.children?.[2].label).toBe('Zebra');
    });

    it('should enable renaming for XLSX files', () => {
      const xlsxEntry: LocalFile = {
        id: 'xlsx-123' as LocalEntryId,
        name: 'data',
        ext: 'xlsx',
        fileType: 'data-source',
        uniqueAlias: 'my_data',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: XlsxSheetView = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'xlsx-sheet',
        viewName: 'data_xlsx',
        fileSourceId: 'xlsx-123' as LocalEntryId,
        sheetName: 'MainSheet',
      };

      const node = buildXlsxFileNode(xlsxEntry, source, [], mockContext);

      expect(node.renameCallbacks).toBeDefined();
      expect(node.renameCallbacks?.prepareRenameValue?.(node)).toBe('my_data');

      // Test rename submit
      node.renameCallbacks?.onRenameSubmit(node, 'new_name');
      expect(renameXlsxFile).toHaveBeenCalledWith('xlsx-123', 'new_name', mockContext.conn);
    });
  });

  describe('buildFileNode', () => {
    it('should build regular file node for CSV', () => {
      const csvEntry: LocalFile = {
        id: 'csv-123' as LocalEntryId,
        name: 'data',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'data.csv',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
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
      const csvEntry: LocalFile = {
        id: 'csv-123' as LocalEntryId,
        name: 'data',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'data.csv',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'old_view_name',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);

      expect(node.renameCallbacks).toBeDefined();
      expect(node.renameCallbacks?.prepareRenameValue?.(node)).toBe('old_view_name');

      // Test rename submit
      node.renameCallbacks?.onRenameSubmit(node, 'new_view_name');
      expect(renameFile).toHaveBeenCalledWith('ds-123', 'new_view_name', mockContext.conn);
    });

    it('should enable deletion for user-added files', () => {
      const csvEntry: LocalFile = {
        id: 'csv-123' as LocalEntryId,
        name: 'data',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'data.csv',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'data_csv',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);

      expect(node.onDelete).toBeDefined();
      node.onDelete?.(node);
      expect(deleteDataSources).toHaveBeenCalledWith(mockContext.conn, ['ds-123']);
    });

    it('should have comprehensive context menu', () => {
      const csvEntry: LocalFile = {
        id: 'csv-123' as LocalEntryId,
        name: 'data',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'data.csv',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const source: AnyFlatFileDataSource = {
        id: 'ds-123' as PersistentDataSourceId,
        type: 'csv',
        viewName: 'data_csv',
        fileSourceId: 'csv-123' as LocalEntryId,
      };

      const node = buildFileNode(csvEntry, source, mockContext);
      const menuItems = node.contextMenu?.[0].children || [];

      expect(menuItems).toHaveLength(5);
      expect(menuItems.map((item) => item.label)).toEqual([
        'Copy Full Name',
        'Create a Query',
        'Show Schema',
        'Comparison',
        'Convert To',
      ]);

      // Test Create a Query
      (createSQLScript as jest.Mock).mockReturnValue({ id: 'script-123' });
      const queryItem = menuItems.find((item) => item.label === 'Create a Query');
      queryItem?.onClick?.(node, {} as any);
      expect(createSQLScript).toHaveBeenCalledWith(
        'data_csv_query',
        'SELECT * FROM main.data_csv;',
      );

      const comparisonMenu = menuItems.find((item) => item.label === 'Comparison');
      expect(comparisonMenu).toBeDefined();
      expect(comparisonMenu?.submenu).toHaveLength(3);
    });
  });

  describe('buildDatabaseFileNode', () => {
    it('should build database file node with special styling', () => {
      const dbEntry: LocalFile = {
        id: 'db-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        uniqueAlias: 'database.duckdb',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
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
      const folderEntry: LocalFolder = {
        id: 'folder-123' as LocalEntryId,
        name: 'folder',
        uniqueAlias: 'folder',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      expect(() => buildDatabaseFileNode(folderEntry, mockContext)).toThrow('Entry must be a file');
    });

    it('should not have deletion or context menu', () => {
      const dbEntry: LocalFile = {
        id: 'db-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        uniqueAlias: 'database.duckdb',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
      };

      const node = buildDatabaseFileNode(dbEntry, mockContext);

      expect(node.onDelete).toBeUndefined();
      expect(node.contextMenu).toEqual([]);
    });

    it('should register in node maps', () => {
      const dbEntry: LocalFile = {
        id: 'db-123' as LocalEntryId,
        name: 'database',
        ext: 'duckdb',
        fileType: 'data-source',
        uniqueAlias: 'database.duckdb',
        kind: 'file',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
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
      const rootFolder: LocalFolder = {
        id: 'root' as LocalEntryId,
        name: 'Root',
        uniqueAlias: 'Root',
        kind: 'directory',
        parentId: null,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const childFolder: LocalFolder = {
        id: 'child' as LocalEntryId,
        name: 'Child',
        uniqueAlias: 'Child',
        kind: 'directory',
        parentId: 'root' as LocalEntryId,
        userAdded: true,
        handle: {} as FileSystemDirectoryHandle,
      };

      const leafFile: LocalFile = {
        id: 'file' as LocalEntryId,
        name: 'leaf',
        ext: 'csv',
        fileType: 'data-source',
        uniqueAlias: 'leaf.csv',
        kind: 'file',
        parentId: 'child' as LocalEntryId,
        userAdded: true,
        handle: {} as FileSystemFileHandle,
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
