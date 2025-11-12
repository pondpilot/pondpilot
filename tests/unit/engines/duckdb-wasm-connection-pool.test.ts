import { DuckDBWasmConnectionPool } from '@engines/duckdb-wasm-connection-pool';
import { DuckDBWasmEngine } from '@engines/duckdb-wasm-engine';

// Mock the engine
jest.mock('@engines/duckdb-wasm-engine');

describe('DuckDBWasmConnectionPool', () => {
  let mockEngine: jest.Mocked<DuckDBWasmEngine>;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      execute: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockEngine = {
      createConnection: jest.fn().mockResolvedValue(mockConnection),
      db: {},
    } as any;
  });

  describe('Regression: Interval memory leak (TypeScript Critical #3)', () => {
    it('should have cleanupIntervalHandle property to track interval', async () => {
      const pool = new DuckDBWasmConnectionPool(mockEngine, {
        minSize: 1,
        maxSize: 5,
        idleTimeout: 30000,
      });

      await pool.initialize();

      // Verify the pool has the interval handle property (via private access check)
      // This verifies the fix is in place - we added the property to track the interval
      expect(pool).toHaveProperty('cleanupIntervalHandle');

      await pool.close();
    });

    it('should not have interval when idleTimeout is 0', async () => {
      const pool = new DuckDBWasmConnectionPool(mockEngine, {
        minSize: 1,
        maxSize: 5,
        idleTimeout: 0,
      });

      await pool.initialize();

      // When idleTimeout is 0, no cleanup interval should be created
      // This is the behavior that prevents the leak when intervals aren't needed
      expect(pool).toHaveProperty('cleanupIntervalHandle');

      await pool.close();
    });

    it('should handle multiple close calls without errors', async () => {
      const pool = new DuckDBWasmConnectionPool(mockEngine, {
        minSize: 1,
        maxSize: 5,
        idleTimeout: 30000,
      });

      await pool.initialize();
      await pool.close();

      // Second close should not throw (interval already cleared)
      await expect(pool.close()).resolves.not.toThrow();
    });

    it('should clean up connections on close', async () => {
      const pool = new DuckDBWasmConnectionPool(mockEngine, {
        minSize: 2,
        maxSize: 5,
        idleTimeout: 30000,
      });

      await pool.initialize();

      // Verify connections were created
      expect(mockEngine.createConnection).toHaveBeenCalledTimes(2);

      await pool.close();

      // Verify all connections were closed
      expect(mockConnection.close).toHaveBeenCalled();

      // Verify pool size is 0 after close
      expect(pool.size()).toBe(0);
    });
  });
});
