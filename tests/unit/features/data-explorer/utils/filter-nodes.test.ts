import { TreeNodeData } from '@components/explorer-tree';
import { FileTypeFilter } from '@features/data-explorer/components/data-explorer-filters';
import { DataExplorerNodeTypeMap } from '@features/data-explorer/model';
import { filterTreeNodes } from '@features/data-explorer/utils/filter-nodes';
import { describe, it, expect } from '@jest/globals';

describe('filterTreeNodes', () => {
  // Helper function to create test nodes
  const createFileNode = (
    value: string,
    label: string,
    nodeType: 'file' | 'sheet' = 'file',
  ): any => ({
    value,
    label,
    nodeType,
    iconType: 'file',
    isDisabled: false,
    isSelectable: true,
    contextMenu: [],
  });

  const createFolderNode = (value: string, label: string, children: any[]): any => ({
    value,
    label,
    nodeType: 'folder',
    children,
    iconType: 'folder',
    isDisabled: false,
    isSelectable: false,
    contextMenu: [],
  });

  const createDatabaseNode = (value: string, label: string, children?: any[]): any => ({
    value,
    label,
    nodeType: 'db',
    children,
    iconType: 'db',
    isDisabled: false,
    isSelectable: true,
    contextMenu: [],
  });

  // Mock file extension getter
  const getFileExtension = (node: any): string | null => {
    const match = node.label.match(/\.(\w+)$/);
    return match ? match[1].toLowerCase() : null;
  };

  describe('filter by type', () => {
    const testNodes: any[] = [
      createFileNode('file1', 'data.csv'),
      createFileNode('file2', '[DB] chinook.db'),
      createFolderNode('folder1', 'documents', [
        createFileNode('file3', 'report.json'),
        createFileNode('file4', 'data.json'),
      ]),
      createDatabaseNode('db1', 'local_db'),
      createDatabaseNode('db2', 'remote_db'),
    ];

    it('should return all nodes when filter is "all"', () => {
      const result = filterTreeNodes(testNodes, 'all');
      expect(result).toHaveLength(5);
      expect(result).toEqual(testNodes);
    });

    it('should return only file nodes and folders with files when filter is "files"', () => {
      const result = filterTreeNodes(testNodes, 'files');
      expect(result).toHaveLength(2); // data.csv and documents folder
      expect(result[0].label).toBe('data.csv');
      expect(result[1].label).toBe('documents');
      expect(result[1].children).toHaveLength(2);
    });

    it('should exclude database files marked with [DB] prefix when filter is "files"', () => {
      const result = filterTreeNodes(testNodes, 'files');
      const labels = result.map((n) => n.label);
      expect(labels).not.toContain('[DB] chinook.db');
    });

    it('should return nodes as-is for non-file filters', () => {
      const result = filterTreeNodes(testNodes, 'databases');
      expect(result).toHaveLength(5);
      expect(result).toEqual(testNodes);
    });
  });

  describe('file type filtering', () => {
    const testNodes: any[] = [
      createFileNode('file1', 'data.csv'),
      createFileNode('file2', 'report.json'),
      createFileNode('file3', 'config.json'),
      createFileNode('file4', 'sales.xlsx'),
      createFileNode('file5', 'data.parquet'),
      createFolderNode('folder1', 'mixed', [
        createFileNode('file6', 'nested.csv'),
        createFileNode('file7', 'nested.json'),
      ]),
    ];

    it('should filter files by extension when fileTypeFilter is provided', () => {
      const fileTypeFilter: FileTypeFilter = {
        csv: true,
        json: false,
        parquet: true,
        xlsx: false,
        sas7bdat: false,
        xpt: false,
        sav: false,
        zsav: false,
        por: false,
        dta: false,
      };

      const result = filterTreeNodes(testNodes, 'files', fileTypeFilter, getFileExtension);
      const fileLabels = result.filter((n) => n.nodeType === 'file').map((n) => n.label);

      expect(fileLabels).toContain('data.csv');
      // All non-filtered types are included
      expect(fileLabels).not.toContain('config.json');
      expect(fileLabels).not.toContain('sales.xlsx');
      expect(fileLabels).toContain('data.parquet');
    });

    it('should filter files in nested folders', () => {
      const fileTypeFilter: FileTypeFilter = {
        csv: true,
        json: false,
        parquet: false,
        xlsx: false,
        sas7bdat: false,
        xpt: false,
        sav: false,
        zsav: false,
        por: false,
        dta: false,
      };

      const result = filterTreeNodes(testNodes, 'files', fileTypeFilter, getFileExtension);
      const folderNode = result.find((n) => n.label === 'mixed');

      expect(folderNode).toBeDefined();
      expect(folderNode?.children).toHaveLength(1);
      expect(folderNode?.children?.[0].label).toBe('nested.csv');
    });

    it('should exclude empty folders after filtering', () => {
      const fileTypeFilter: FileTypeFilter = {
        csv: false,
        json: false,
        parquet: false,
        xlsx: false,
        sas7bdat: false,
        xpt: false,
        sav: false,
        zsav: false,
        por: false,
        dta: false,
      };

      const result = filterTreeNodes(testNodes, 'files', fileTypeFilter, getFileExtension);
      const folderNode = result.find((n) => n.label === 'mixed');

      expect(folderNode).toBeUndefined();
    });
  });

  describe('search query filtering', () => {
    const testNodes: any[] = [
      createFileNode('file1', 'customer_data.csv'),
      createFileNode('file2', 'orders.json'),
      createFileNode('file3', 'custom_report.json'),
      createFolderNode('folder1', 'customers', [
        createFileNode('file4', 'list.csv'),
        createFileNode('file5', 'addresses.json'),
      ]),
      createDatabaseNode('db1', 'customer_db'),
    ];

    it('should filter nodes by search query using fuzzy match', () => {
      const result = filterTreeNodes(testNodes, 'all', undefined, undefined, 'cust');

      expect(result).toHaveLength(4); // customer_data.csv, custom_report.json, customers folder, customer_db
      const labels = result.map((n) => n.label);
      expect(labels).toContain('customer_data.csv');
      expect(labels).toContain('custom_report.json');
      expect(labels).toContain('customers');
      expect(labels).toContain('customer_db');
    });

    it('should include parent folders when children match search', () => {
      const result = filterTreeNodes(testNodes, 'all', undefined, undefined, 'addresses');

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('customers');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children?.[0].label).toBe('addresses.json');
    });

    it('should not include folders without matching children', () => {
      const result = filterTreeNodes(testNodes, 'all', undefined, undefined, 'xyz');

      expect(result).toHaveLength(0);
    });

    it('should handle empty search query', () => {
      const result = filterTreeNodes(testNodes, 'all', undefined, undefined, '');

      expect(result).toHaveLength(5);
      expect(result).toEqual(testNodes);
    });
  });

  describe('nested structure preservation', () => {
    const nestedNodes: TreeNodeData<DataExplorerNodeTypeMap>[] = [
      createFolderNode('root', 'root', [
        createFolderNode('level1', 'documents', [
          createFolderNode('level2', 'reports', [
            createFileNode('file1', 'quarterly.csv'),
            createFileNode('file2', 'annual.json'),
          ]),
          createFileNode('file3', 'summary.json'),
        ]),
        createFileNode('file4', 'readme.txt'),
      ]),
    ];

    it('should preserve nested folder structure when filtering', () => {
      const fileTypeFilter: FileTypeFilter = {
        csv: true,
        json: true,
        parquet: false,
        xlsx: false,
        sas7bdat: false,
        xpt: false,
        sav: false,
        zsav: false,
        por: false,
        dta: false,
      };

      const result = filterTreeNodes(nestedNodes, 'files', fileTypeFilter, getFileExtension);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('root');

      const level1 = result[0].children;
      expect(level1).toHaveLength(2); // documents folder and readme.txt

      const documentsFolder = level1?.find((n) => n.label === 'documents');
      expect(documentsFolder?.children).toHaveLength(2); // reports folder and summary.json

      const reportsFolder = documentsFolder?.children?.find((n) => n.label === 'reports');
      expect(reportsFolder?.children).toHaveLength(2); // both quarterly.csv and annual.json
      expect(reportsFolder?.children?.find((n) => n.label === 'quarterly.csv')).toBeDefined();
      expect(reportsFolder?.children?.find((n) => n.label === 'annual.json')).toBeDefined();
    });

    it('should maintain structure when all files match', () => {
      const result = filterTreeNodes(nestedNodes, 'files');

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('root');
      expect(result[0].children).toHaveLength(2);

      const documentsFolder = result[0].children?.find((n) => n.label === 'documents');
      expect(documentsFolder?.children).toHaveLength(2);

      const reportsFolder = documentsFolder?.children?.find((n) => n.label === 'reports');
      expect(reportsFolder?.children).toHaveLength(2);
    });
  });

  describe('auto-expansion for search results', () => {
    const testNodes: any[] = [
      createFolderNode('folder1', 'documents', [
        createFolderNode('folder2', 'reports', [createFileNode('file1', 'financial_report.json')]),
        createFileNode('file2', 'summary.txt'),
      ]),
      createFileNode('file3', 'report.csv'),
    ];

    it('should mark folders for expansion when they contain search matches', () => {
      const expandedState: Record<string, boolean> = {};

      filterTreeNodes(testNodes, 'all', undefined, undefined, 'report', expandedState);

      expect(expandedState.folder1).toBe(true);
      expect(expandedState.folder2).toBe(true);
    });

    it('should not expand folders without matching children', () => {
      const expandedState: Record<string, boolean> = {};

      filterTreeNodes(testNodes, 'all', undefined, undefined, 'summary', expandedState);

      expect(expandedState.folder1).toBe(true);
      expect(expandedState.folder2).toBeUndefined();
    });

    it('should not modify expandedState when no search query', () => {
      const expandedState: Record<string, boolean> = {};

      filterTreeNodes(testNodes, 'all', undefined, undefined, '', expandedState);

      expect(Object.keys(expandedState)).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty node array', () => {
      const result = filterTreeNodes([], 'all');
      expect(result).toEqual([]);
    });

    it('should handle nodes without children property', () => {
      const nodes = [
        createFileNode('file1', 'test.csv'),
        { value: 'node1', label: 'Node without children', nodeType: 'database' as const },
      ];

      const result = filterTreeNodes(nodes, 'files');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('test.csv');
    });

    it('should handle deeply nested empty folders', () => {
      const nodes = [
        createFolderNode('f1', 'folder1', [
          createFolderNode('f2', 'folder2', [createFolderNode('f3', 'folder3', [])]),
        ]),
      ];

      const result = filterTreeNodes(nodes, 'files');
      expect(result).toHaveLength(0);
    });

    it('should handle special characters in search', () => {
      const nodes = [
        createFileNode('file1', 'test[1].csv'),
        createFileNode('file2', 'data (copy).json'),
        createFileNode('file3', 'file.test.json'),
      ];

      const result = filterTreeNodes(nodes, 'all', undefined, undefined, '[1]');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('test[1].csv');
    });
  });
});
