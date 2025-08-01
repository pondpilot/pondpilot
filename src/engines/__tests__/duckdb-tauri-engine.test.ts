import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DuckDBTauriEngine } from '../duckdb-tauri-engine';
import { TauriConnectionPool } from '../tauri-connection-pool';
import { EngineConfig, QueryResult } from '../types';

// Mock the Tauri API
jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

// Mock the connection pool
jest.mock('../tauri-connection-pool');

describe('DuckDBTauriEngine', () => {
  let engine: DuckDBTauriEngine;
  let mockConnectionPool: any;
  const defaultConfig: EngineConfig = {
    type: 'duckdb-tauri',
    persistent: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionPool = {
      acquire: jest.fn(),
      release: jest.fn(),
      close: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        totalConnections: 5,
        activeConnections: 2,
        idleConnections: 3,
        waitingRequests: 0,
      }),
    } as any;

    (TauriConnectionPool as jest.MockedClass<typeof TauriConnectionPool>).mockImplementation(
      () => mockConnectionPool,
    );

    engine = new DuckDBTauriEngine();
  });

  describe('initialization', () => {
    it('should initialize the connection pool', async () => {
      await engine.initialize(defaultConfig);

      expect(TauriConnectionPool).toHaveBeenCalledWith({
        maxSize: 5,
        timeout: 30,
      });
      expect((engine as any).initialized).toBe(true);
    });

    it('should only initialize once', async () => {
      await engine.initialize(defaultConfig);
      await engine.initialize(defaultConfig);

      expect(TauriConnectionPool).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      (TauriConnectionPool as jest.MockedClass<typeof TauriConnectionPool>).mockImplementationOnce(
        () => {
          throw new Error('Pool initialization failed');
        },
      );

      const newEngine = new DuckDBTauriEngine();
      await expect(newEngine.initialize(defaultConfig)).rejects.toThrow(
        'Pool initialization failed',
      );
    });
  });

  describe('query execution', () => {
    let mockConnection: any;

    beforeEach(async () => {
      mockConnection = {
        execute: jest.fn(),
        executeWithoutResults: jest.fn(),
        close: jest.fn(),
      };
      mockConnectionPool.acquire.mockResolvedValue(mockConnection);
      await engine.initialize(defaultConfig);
    });

    it('should execute queries successfully', async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1, name: 'test' }],
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'VARCHAR' },
        ],
        rowCount: 1,
      };
      mockConnection.execute.mockResolvedValueOnce(mockResult);

      const result = await engine.execute('SELECT * FROM test');

      expect(result).toEqual(mockResult);
      expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM test', undefined);
      expect(mockConnectionPool.release).toHaveBeenCalledWith(mockConnection);
    });

    it('should execute queries with parameters', async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1 }],
        columns: [{ name: 'id', type: 'INTEGER' }],
        rowCount: 1,
      };
      mockConnection.execute.mockResolvedValueOnce(mockResult);

      const result = await engine.execute('SELECT * FROM test WHERE id = ?', [1]);

      expect(result).toEqual(mockResult);
      expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM test WHERE id = ?', [1]);
    });

    it('should release connection even on error', async () => {
      const error = new Error('Query failed');
      mockConnection.execute.mockRejectedValueOnce(error);

      await expect(engine.execute('INVALID SQL')).rejects.toThrow('Query failed');
      expect(mockConnectionPool.release).toHaveBeenCalledWith(mockConnection);
    });

    it('should throw error if executing before initialization', async () => {
      const uninitializedEngine = new DuckDBTauriEngine();

      await expect(uninitializedEngine.execute('SELECT 1')).rejects.toThrow(
        'Engine not initialized',
      );
    });
  });

  describe('executeWithoutResults', () => {
    let mockConnection: any;

    beforeEach(async () => {
      mockConnection = {
        execute: jest.fn(),
        executeWithoutResults: jest.fn(),
        close: jest.fn(),
      };
      mockConnectionPool.acquire.mockResolvedValue(mockConnection);
      await engine.initialize(defaultConfig);
    });

    it('should execute commands without returning results', async () => {
      mockConnection.executeWithoutResults.mockResolvedValueOnce(undefined);

      await (engine as any).executeWithoutResults('CREATE TABLE test (id INT)');

      expect(mockConnection.executeWithoutResults).toHaveBeenCalledWith(
        'CREATE TABLE test (id INT)',
        undefined,
      );
      expect(mockConnectionPool.release).toHaveBeenCalledWith(mockConnection);
    });

    it('should handle errors and still release connection', async () => {
      const error = new Error('Command failed');
      mockConnection.executeWithoutResults.mockRejectedValueOnce(error);

      await expect((engine as any).executeWithoutResults('INVALID COMMAND')).rejects.toThrow(
        'Command failed',
      );
      expect(mockConnectionPool.release).toHaveBeenCalledWith(mockConnection);
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await engine.initialize(defaultConfig);
    });

    it('should register files by path', async () => {
      const mockTauri = require('@tauri-apps/api/core');
      mockTauri.invoke.mockResolvedValueOnce({ success: true });

      await engine.registerFile({ name: 'test.csv', type: 'path', path: '/path/to/test.csv' });

      expect(mockTauri.invoke).toHaveBeenCalledWith('register_file', {
        name: 'test.csv',
        path: '/path/to/test.csv',
      });
    });

    it('should throw error when registering non-string file handle', async () => {
      await expect(
        engine.registerFile({ name: 'test.csv', type: 'path', path: {} as any }),
      ).rejects.toThrow('Tauri engine requires file paths as strings');
    });

    it('should drop files successfully', async () => {
      const mockTauri = require('@tauri-apps/api/core');
      mockTauri.invoke.mockResolvedValueOnce({ success: true });

      await engine.dropFile('test.csv');

      expect(mockTauri.invoke).toHaveBeenCalledWith('drop_file', {
        name: 'test.csv',
      });
    });

    it('should handle file operation errors', async () => {
      const mockTauri = require('@tauri-apps/api/core');
      mockTauri.invoke.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        engine.registerFile({ name: 'test.csv', type: 'path', path: '/invalid/path' }),
      ).rejects.toThrow('File not found');
    });
  });

  describe('connection pool access', () => {
    it('should return the connection pool after initialization', async () => {
      await engine.initialize(defaultConfig);

      const result = await engine.createConnectionPool(5);

      expect(result).toBe(mockConnectionPool);
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
      expect((engine as any).initialized).toBe(false);
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

  describe('pool statistics', () => {
    it('should return pool statistics when initialized', async () => {
      await engine.initialize(defaultConfig);

      const stats = (engine as any).getPoolStats();

      expect(stats).toEqual({
        totalConnections: 5,
        activeConnections: 2,
        idleConnections: 3,
        waitingRequests: 0,
      });
    });

    it('should return null statistics when not initialized', () => {
      const stats = (engine as any).getPoolStats();

      expect(stats).toBeNull();
    });
  });
});
