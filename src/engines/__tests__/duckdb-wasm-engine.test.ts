import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DuckDBWasmConnectionPool } from '../duckdb-wasm-connection-pool';
import { DuckDBWasmEngine } from '../duckdb-wasm-engine';
import { EngineConfig } from '../types';

// Mock the connection pool
jest.mock('../duckdb-wasm-connection-pool');

describe('DuckDBWASMEngine', () => {
  let engine: DuckDBWasmEngine;
  let mockConnectionPool: any;
  const defaultConfig: EngineConfig = {
    type: 'duckdb-wasm',
    persistent: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const mockFn = (...args: any[]) => jest.fn(...args);
    mockConnectionPool = {
      initialize: mockFn().mockResolvedValue(undefined),
      execute: mockFn(),
      executeWithoutResults: mockFn(),
      registerFile: mockFn(),
      dropFile: mockFn(),
      close: mockFn(),
      getConnectionPool: mockFn().mockReturnValue(null),
      size: mockFn().mockReturnValue(0),
      getStats: mockFn().mockReturnValue({
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingRequests: 0,
      }),
      setMaxSize: mockFn(),
      getMaxSize: mockFn().mockReturnValue(10),
      stream: mockFn(),
      prepare: mockFn(),
      getDatabases: mockFn().mockResolvedValue([]),
      getTables: mockFn().mockResolvedValue([]),
      getColumns: mockFn().mockResolvedValue([]),
      checkpoint: mockFn().mockResolvedValue(undefined),
      export: mockFn().mockResolvedValue(new ArrayBuffer(0)),
      import: mockFn().mockResolvedValue(undefined),
      loadExtension: mockFn().mockResolvedValue(undefined),
      listExtensions: mockFn().mockResolvedValue([]),
      listFiles: mockFn().mockResolvedValue([]),
      getCatalog: mockFn().mockResolvedValue({ databases: [] }),
    };

    (
      DuckDBWasmConnectionPool as jest.MockedClass<typeof DuckDBWasmConnectionPool>
    ).mockImplementation(() => mockConnectionPool);

    engine = new DuckDBWasmEngine();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await engine.initialize(defaultConfig);

      expect(mockConnectionPool.initialize).toHaveBeenCalledTimes(1);
    });

    it('should only initialize once', async () => {
      await engine.initialize(defaultConfig);
      await engine.initialize(defaultConfig);

      expect(mockConnectionPool.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockConnectionPool.initialize.mockRejectedValueOnce(error);

      await expect(engine.initialize(defaultConfig)).rejects.toThrow('Initialization failed');
    });
  });

  describe('query execution', () => {
    beforeEach(async () => {
      await engine.initialize(defaultConfig);
    });

    it('should execute queries successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'VARCHAR' },
        ],
        rowCount: 1,
      };
      mockConnectionPool.execute.mockResolvedValueOnce(mockResult);

      const result = await engine.execute('SELECT * FROM test');

      expect(result).toEqual(mockResult);
      expect(mockConnectionPool.execute).toHaveBeenCalledWith('SELECT * FROM test', undefined);
    });

    it('should execute queries with parameters', async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        columns: [{ name: 'id', type: 'INTEGER' }],
        rowCount: 1,
      };
      mockConnectionPool.execute.mockResolvedValueOnce(mockResult);

      const result = await engine.execute('SELECT * FROM test WHERE id = ?', [1]);

      expect(result).toEqual(mockResult);
      expect(mockConnectionPool.execute).toHaveBeenCalledWith('SELECT * FROM test WHERE id = ?', [
        1,
      ]);
    });

    it('should handle query execution errors', async () => {
      const error = new Error('Query failed');
      mockConnectionPool.execute.mockRejectedValueOnce(error);

      await expect(engine.execute('INVALID SQL')).rejects.toThrow('Query failed');
    });

    it('should throw error if executing before initialization', async () => {
      const uninitializedEngine = new DuckDBWasmEngine();

      await expect(uninitializedEngine.execute('SELECT 1')).rejects.toThrow(
        'Engine not initialized',
      );
    });
  });

  describe('executeWithoutResults', () => {
    beforeEach(async () => {
      await engine.initialize(defaultConfig);
    });

    it('should execute commands without returning results', async () => {
      mockConnectionPool.executeWithoutResults.mockResolvedValueOnce(undefined);

      await (engine as any).executeWithoutResults('CREATE TABLE test (id INT)');

      expect(mockConnectionPool.executeWithoutResults).toHaveBeenCalledWith(
        'CREATE TABLE test (id INT)',
        undefined,
      );
    });

    it('should handle errors in executeWithoutResults', async () => {
      const error = new Error('Command failed');
      mockConnectionPool.executeWithoutResults.mockRejectedValueOnce(error);

      await expect((engine as any).executeWithoutResults('INVALID COMMAND')).rejects.toThrow(
        'Command failed',
      );
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await engine.initialize(defaultConfig);
    });

    it('should register files successfully', async () => {
      const fileHandle = { name: 'test.csv' } as any;
      mockConnectionPool.registerFile.mockResolvedValueOnce(undefined);

      await engine.registerFile({ name: 'test.csv', type: 'file-handle', handle: fileHandle });

      expect(mockConnectionPool.registerFile).toHaveBeenCalledWith('test.csv', fileHandle);
    });

    it('should drop files successfully', async () => {
      mockConnectionPool.dropFile.mockResolvedValueOnce(undefined);

      await engine.dropFile('test.csv');

      expect(mockConnectionPool.dropFile).toHaveBeenCalledWith('test.csv');
    });

    it('should handle file registration errors', async () => {
      const error = new Error('Failed to register file');
      mockConnectionPool.registerFile.mockRejectedValueOnce(error);

      await expect(
        engine.registerFile({ name: 'test.csv', type: 'file-handle', handle: {} as any }),
      ).rejects.toThrow('Failed to register file');
    });
  });

  describe('connection pool access', () => {
    it('should return the connection pool', async () => {
      await engine.initialize(defaultConfig);
      const pool = { test: 'pool' };
      const result = await engine.createConnectionPool(5);

      expect(result).toBe(pool);
    });

    it('should return null if not initialized', async () => {
      const result = await engine.createConnectionPool(5);

      expect(result).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should close the connection pool on shutdown', async () => {
      await engine.initialize(defaultConfig);
      mockConnectionPool.close.mockResolvedValueOnce(undefined);

      await engine.shutdown();

      expect(mockConnectionPool.close).toHaveBeenCalledTimes(1);
    });

    it('should handle shutdown without initialization', async () => {
      await expect(engine.shutdown()).resolves.not.toThrow();
    });

    it('should handle shutdown errors', async () => {
      await engine.initialize(defaultConfig);
      const error = new Error('Shutdown failed');
      mockConnectionPool.close.mockRejectedValueOnce(error);

      await expect(engine.shutdown()).rejects.toThrow('Shutdown failed');
    });
  });

  describe('configuration', () => {
    it('should store persistent configuration', () => {
      const persistentConfig: EngineConfig = {
        type: 'duckdb-wasm',
        persistent: true,
      };
      const persistentEngine = new DuckDBWasmEngine();

      expect((persistentEngine as any).config.persistent).toBe(true);
    });

    it('should handle custom WASM path', () => {
      const customConfig: EngineConfig = {
        type: 'duckdb-wasm',
        persistent: false,
        wasmUrl: '/custom/path',
      };
      const customEngine = new DuckDBWasmEngine();

      expect((customEngine as any).config.wasmUrl).toBe('/custom/path');
    });
  });
});
