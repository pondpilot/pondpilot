import { DataExplorerFilterType } from '@features/data-explorer/components/data-explorer-filters';
import { useFilterNodes } from '@features/data-explorer/hooks/use-filter-nodes';
// Import the hook after mocks are set up
import { filterTreeNodes } from '@features/data-explorer/utils';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock React hooks
jest.mock('react', () => ({
  useMemo: jest.fn((fn: any) => fn()),
  useCallback: jest.fn((fn: any) => fn),
}));

// Mock the filterTreeNodes utility
jest.mock('@features/data-explorer/utils', () => ({
  filterTreeNodes: jest.fn(
    (
      nodes: any,
      filter: any,
      fileTypeFilter: any,
      getFileExt: any,
      searchQuery: any,
      _expandedState: any,
    ) => {
      // Simple mock implementation
      if (searchQuery) {
        // For search, just return nodes that include the search query in label
        return nodes.filter((node: any) =>
          node.label.toLowerCase().includes(searchQuery.toLowerCase()),
        );
      }
      if (filter === 'all') return nodes;
      if (filter === 'files') return nodes.filter((n: any) => n.nodeType === 'file');
      return nodes;
    },
  ),
}));

describe('useFilterNodes', () => {
  const createFileNode = (id: string, label: string): any => ({
    value: id,
    label,
    nodeType: 'file',
  });

  const createDbNode = (id: string, label: string): any => ({
    value: id,
    label,
    nodeType: 'db',
  });

  const defaultProps = {
    fileSystemNodes: [createFileNode('file1', 'data.csv'), createFileNode('file2', 'report.json')],
    localDbNodes: [createDbNode('db1', 'local.db')],
    remoteDatabaseNodes: [createDbNode('remote1', 'cloud.db')],
    motherDuckNodes: [createDbNode('motherduck1', 'MotherDuck')],
    activeFilter: 'all' as DataExplorerFilterType,
    fileTypeFilter: {
      csv: true,
      json: true,
      parquet: true,
      xlsx: true,
    },
    searchQuery: '',
    localEntriesValues: new Map([
      ['file1', { kind: 'file', fileType: 'data-source', ext: 'csv' }],
      ['file2', { kind: 'file', fileType: 'data-source', ext: 'json' }],
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filter visibility', () => {
    it('should show all sections when filter is "all"', () => {
      const result = useFilterNodes(defaultProps);

      expect(result.filteredSections.showSystemDb).toBe(true);
      expect(result.filteredSections.showFileSystem).toBe(true);
      expect(result.filteredSections.showLocalDbs).toBe(true);
      expect(result.filteredSections.showRemoteDbs).toBe(true);
    });

    it('should show only file system when filter is "files"', () => {
      const result = useFilterNodes({ ...defaultProps, activeFilter: 'files' });

      expect(result.filteredSections.showSystemDb).toBe(false);
      expect(result.filteredSections.showFileSystem).toBe(true);
      expect(result.filteredSections.showLocalDbs).toBe(false);
      expect(result.filteredSections.showRemoteDbs).toBe(false);
    });

    it('should show databases when filter is "databases"', () => {
      const result = useFilterNodes({ ...defaultProps, activeFilter: 'databases' });

      expect(result.filteredSections.showSystemDb).toBe(true);
      expect(result.filteredSections.showFileSystem).toBe(false);
      expect(result.filteredSections.showLocalDbs).toBe(true);
      expect(result.filteredSections.showRemoteDbs).toBe(false);
    });

    it('should show only remote databases when filter is "remote"', () => {
      const result = useFilterNodes({ ...defaultProps, activeFilter: 'remote' });

      expect(result.filteredSections.showSystemDb).toBe(false);
      expect(result.filteredSections.showFileSystem).toBe(false);
      expect(result.filteredSections.showLocalDbs).toBe(false);
      expect(result.filteredSections.showRemoteDbs).toBe(true);
    });
  });

  describe('search functionality', () => {
    it('should filter all sections when search query is provided', () => {
      const result = useFilterNodes({ ...defaultProps, searchQuery: 'data' });

      // Our mock filters by label containing search query
      expect(result.filteredSections.filteredFileSystemNodes).toHaveLength(1);
      expect(result.filteredSections.filteredFileSystemNodes[0].label).toBe('data.csv');
    });

    it('should return empty expanded state when no search', () => {
      const result = useFilterNodes(defaultProps);

      expect(result.searchExpandedState).toEqual({});
    });

    it('should return expanded state when searching', () => {
      const result = useFilterNodes({ ...defaultProps, searchQuery: 'test' });

      // The expanded state is populated by filterTreeNodes
      expect(typeof result.searchExpandedState).toBe('object');
    });
  });

  describe('file extension extraction', () => {
    it('should create getFileExtension callback', () => {
      const result = useFilterNodes(defaultProps);

      // The hook creates getFileExtension internally
      // We can't directly test it, but we know it's used by filterTreeNodes
      expect(result.filteredSections.filteredFileSystemNodes).toBeDefined();

      // Verify filterTreeNodes was called with a function
      expect(filterTreeNodes).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(Object),
        expect.any(Function), // getFileExtension
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('integration with filterTreeNodes', () => {
    it('should pass correct parameters to filterTreeNodes for file system', () => {
      jest.clearAllMocks();

      useFilterNodes(defaultProps);

      // Check that filterTreeNodes was called for file system nodes
      expect(filterTreeNodes).toHaveBeenCalledWith(
        defaultProps.fileSystemNodes,
        defaultProps.activeFilter,
        defaultProps.fileTypeFilter,
        expect.any(Function), // getFileExtension
        defaultProps.searchQuery,
        expect.any(Object), // expandedState
      );
    });

    it('should apply search to database nodes when searching', () => {
      jest.clearAllMocks();

      useFilterNodes({ ...defaultProps, searchQuery: 'test' });

      // Should be called for all node types when searching
      const { calls } = (filterTreeNodes as jest.Mock).mock;
      expect(calls.length).toBeGreaterThan(1);

      // Check that search was applied to local and remote DB nodes
      const dbCalls = calls.filter(
        (call) =>
          call[0] === defaultProps.localDbNodes || call[0] === defaultProps.remoteDatabaseNodes,
      );
      expect(dbCalls.length).toBe(2);
      dbCalls.forEach((call) => {
        expect(call[4]).toBe('test'); // searchQuery parameter
      });
    });
  });
});
