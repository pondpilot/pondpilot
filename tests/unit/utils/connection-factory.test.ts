import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createConnectionBasedRemoteDB, createUrlBasedRemoteDB } from '@models/data-source';
import {
  WASMConnectionFactory,
  TauriConnectionFactory,
  createConnectionFactory,
  isDatabaseSupportedOnPlatform,
  getUnsupportedDatabaseMessage,
} from '@utils/connection-factory';
import { makePersistentDataSourceId } from '@utils/data-source';

// Mock the dependencies
jest.mock('@utils/sql-attach');
jest.mock('@utils/url-helpers');
jest.mock('@utils/helpers');
jest.mock('../../../services/connections-api');

describe('ConnectionFactory', () => {
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
  });

  describe('WASMConnectionFactory', () => {
    let factory: WASMConnectionFactory;

    beforeEach(() => {
      factory = new WASMConnectionFactory();
    });

    it('should support URL-based connections', () => {
      const urlDb = createUrlBasedRemoteDB(
        makePersistentDataSourceId(),
        'https://example.com/db.duckdb',
        'test_db',
      );

      expect(factory.canConnect(urlDb)).toBe(true);
    });

    it('should not support PostgreSQL connections', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      expect(factory.canConnect(pgDb)).toBe(false);
    });

    it('should not support MySQL connections', () => {
      const mysqlDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'mysql',
        'test_db',
      );

      expect(factory.canConnect(mysqlDb)).toBe(false);
    });

    it('should throw error for PostgreSQL connection string creation', async () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      await expect(factory.createConnectionString(pgDb)).rejects.toThrow(
        'Direct postgres connections are not supported in browser environment',
      );
    });

    it('should provide requirements for different connection types', () => {
      const s3Db = createUrlBasedRemoteDB(
        makePersistentDataSourceId(),
        's3://bucket/db.duckdb',
        'test_db',
      );

      const requirements = factory.getConnectionRequirements(s3Db);
      expect(requirements).toContain('Requires proper CORS configuration on S3 bucket');
    });
  });

  describe('TauriConnectionFactory', () => {
    let factory: TauriConnectionFactory;

    beforeEach(() => {
      factory = new TauriConnectionFactory();
    });

    it('should support all connection types', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      const mysqlDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_456',
        'mysql',
        'test_db',
      );

      const urlDb = createUrlBasedRemoteDB(
        makePersistentDataSourceId(),
        'https://example.com/db.duckdb',
        'test_db',
      );

      expect(factory.canConnect(pgDb)).toBe(true);
      expect(factory.canConnect(mysqlDb)).toBe(true);
      expect(factory.canConnect(urlDb)).toBe(true);
    });

    it('should provide requirements for PostgreSQL connections', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      const requirements = factory.getConnectionRequirements(pgDb);
      expect(requirements).toContain("Uses DuckDB's postgres_scanner extension");
      expect(requirements).toContain(
        'Requires PostgreSQL server to be accessible from this machine',
      );
    });
  });

  describe('createConnectionFactory', () => {
    it('should create WASM factory for wasm engine', () => {
      const factory = createConnectionFactory('duckdb-wasm');
      expect(factory).toBeInstanceOf(WASMConnectionFactory);
    });

    it('should create Tauri factory for tauri engine', () => {
      const factory = createConnectionFactory('duckdb-tauri');
      expect(factory).toBeInstanceOf(TauriConnectionFactory);
    });

    it('should throw error for unknown engine type', () => {
      expect(() => createConnectionFactory('unknown' as any)).toThrow(
        'Unsupported engine type: unknown',
      );
    });
  });

  describe('isDatabaseSupportedOnPlatform', () => {
    it('should return true for URL databases on WASM', () => {
      const urlDb = createUrlBasedRemoteDB(
        makePersistentDataSourceId(),
        'https://example.com/db.duckdb',
        'test_db',
      );

      expect(isDatabaseSupportedOnPlatform(urlDb, 'duckdb-wasm')).toBe(true);
    });

    it('should return false for PostgreSQL on WASM', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      expect(isDatabaseSupportedOnPlatform(pgDb, 'duckdb-wasm')).toBe(false);
    });

    it('should return true for PostgreSQL on Tauri', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      expect(isDatabaseSupportedOnPlatform(pgDb, 'duckdb-tauri')).toBe(true);
    });
  });

  describe('getUnsupportedDatabaseMessage', () => {
    it('should provide helpful message for PostgreSQL on WASM', () => {
      const pgDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'postgres',
        'test_db',
      );

      const message = getUnsupportedDatabaseMessage(pgDb, 'duckdb-wasm');
      expect(message).toContain('PostgreSQL databases require the desktop app');
      expect(message).toContain('Browser security prevents direct database connections');
    });

    it('should provide helpful message for MySQL on WASM', () => {
      const mysqlDb = createConnectionBasedRemoteDB(
        makePersistentDataSourceId(),
        'conn_123',
        'mysql',
        'test_db',
      );

      const message = getUnsupportedDatabaseMessage(mysqlDb, 'duckdb-wasm');
      expect(message).toContain('MySQL databases require the desktop app');
    });
  });
});
