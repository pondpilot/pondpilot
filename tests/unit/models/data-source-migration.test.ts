import { describe, it, expect } from '@jest/globals';
import { 
  migrateRemoteDB,
  createConnectionBasedRemoteDB,
  createUrlBasedRemoteDB,
  getSupportedPlatforms,
  requiresProxy,
  RemoteConnectionType,
} from '@models/data-source';
import { makePersistentDataSourceId } from '@utils/data-source';

describe('Data Source Migration and Utilities', () => {
  describe('getSupportedPlatforms', () => {
    it('should return both platforms for URL-based connections', () => {
      const platforms = getSupportedPlatforms('url');
      expect(platforms).toContain('duckdb-wasm');
      expect(platforms).toContain('duckdb-tauri');
    });

    it('should return both platforms for MotherDuck', () => {
      const platforms = getSupportedPlatforms('motherduck');
      expect(platforms).toContain('duckdb-wasm');
      expect(platforms).toContain('duckdb-tauri');
    });

    it('should return both platforms for S3', () => {
      const platforms = getSupportedPlatforms('s3');
      expect(platforms).toContain('duckdb-wasm');
      expect(platforms).toContain('duckdb-tauri');
    });

    it('should return only Tauri for PostgreSQL', () => {
      const platforms = getSupportedPlatforms('postgres');
      expect(platforms).toContain('duckdb-tauri');
      expect(platforms).not.toContain('duckdb-wasm');
    });

    it('should return only Tauri for MySQL', () => {
      const platforms = getSupportedPlatforms('mysql');
      expect(platforms).toContain('duckdb-tauri');
      expect(platforms).not.toContain('duckdb-wasm');
    });
  });

  describe('requiresProxy', () => {
    it('should return true for PostgreSQL', () => {
      expect(requiresProxy('postgres')).toBe(true);
    });

    it('should return true for MySQL', () => {
      expect(requiresProxy('mysql')).toBe(true);
    });

    it('should return false for URL connections', () => {
      expect(requiresProxy('url')).toBe(false);
    });

    it('should return false for MotherDuck', () => {
      expect(requiresProxy('motherduck')).toBe(false);
    });

    it('should return false for S3', () => {
      expect(requiresProxy('s3')).toBe(false);
    });
  });

  describe('migrateRemoteDB', () => {
    it('should migrate legacy URL database with md: protocol', () => {
      const legacyDb = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        url: 'md:my_database',
        dbName: 'test_db',
        dbType: 'duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const migrated = migrateRemoteDB(legacyDb);

      expect(migrated.connectionType).toBe('motherduck');
      expect(migrated.legacyUrl).toBe('md:my_database');
      expect(migrated.queryEngineType).toBe('duckdb');
      expect(migrated.supportedPlatforms).toContain('duckdb-wasm');
      expect(migrated.supportedPlatforms).toContain('duckdb-tauri');
      expect(migrated.requiresProxy).toBe(false);
      expect((migrated as any).url).toBeUndefined();
      expect((migrated as any).dbType).toBeUndefined();
    });

    it('should migrate legacy S3 URL database', () => {
      const legacyDb = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        url: 's3://my-bucket/database.duckdb',
        dbName: 'test_db',
        dbType: 'duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const migrated = migrateRemoteDB(legacyDb);

      expect(migrated.connectionType).toBe('s3');
      expect(migrated.legacyUrl).toBe('s3://my-bucket/database.duckdb');
      expect(migrated.supportedPlatforms).toContain('duckdb-wasm');
      expect(migrated.supportedPlatforms).toContain('duckdb-tauri');
    });

    it('should migrate legacy HTTPS URL database', () => {
      const legacyDb = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        url: 'https://example.com/database.duckdb',
        dbName: 'test_db',
        dbType: 'duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const migrated = migrateRemoteDB(legacyDb);

      expect(migrated.connectionType).toBe('http');
      expect(migrated.legacyUrl).toBe('https://example.com/database.duckdb');
    });

    it('should default to url type for unrecognized URLs', () => {
      const legacyDb = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        url: 'file:///local/database.duckdb',
        dbName: 'test_db',
        dbType: 'duckdb',
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const migrated = migrateRemoteDB(legacyDb);

      expect(migrated.connectionType).toBe('url');
      expect(migrated.legacyUrl).toBe('file:///local/database.duckdb');
    });

    it('should not modify already migrated databases', () => {
      const modernDb = {
        type: 'remote-db',
        id: makePersistentDataSourceId(),
        connectionType: 'postgres' as RemoteConnectionType,
        connectionId: 'conn_123',
        dbName: 'test_db',
        queryEngineType: 'duckdb',
        supportedPlatforms: ['duckdb-tauri'],
        connectionState: 'connected',
        attachedAt: Date.now(),
      };

      const result = migrateRemoteDB(modernDb);

      expect(result).toBe(modernDb); // Should return the same object
      expect(result.connectionType).toBe('postgres');
      expect(result.connectionId).toBe('conn_123');
    });
  });

  describe('createConnectionBasedRemoteDB', () => {
    it('should create PostgreSQL database correctly', () => {
      const id = makePersistentDataSourceId();
      const db = createConnectionBasedRemoteDB(
        id,
        'conn_123',
        'postgres',
        'my_db',
        'My PostgreSQL',
        'secret_456',
        'PostgreSQL database on server'
      );

      expect(db.type).toBe('remote-db');
      expect(db.id).toBe(id);
      expect(db.connectionType).toBe('postgres');
      expect(db.connectionId).toBe('conn_123');
      expect(db.dbName).toBe('my_db');
      expect(db.queryEngineType).toBe('duckdb');
      expect(db.supportedPlatforms).toContain('duckdb-tauri');
      expect(db.supportedPlatforms).not.toContain('duckdb-wasm');
      expect(db.requiresProxy).toBe(true);
      expect(db.connectionState).toBe('connecting');
      expect(db.instanceName).toBe('My PostgreSQL');
      expect(db.instanceId).toBe('secret_456');
      expect(db.comment).toBe('PostgreSQL database on server');
    });

    it('should create MySQL database correctly', () => {
      const id = makePersistentDataSourceId();
      const db = createConnectionBasedRemoteDB(
        id,
        'conn_789',
        'mysql',
        'my_mysql_db'
      );

      expect(db.connectionType).toBe('mysql');
      expect(db.connectionId).toBe('conn_789');
      expect(db.supportedPlatforms).toContain('duckdb-tauri');
      expect(db.supportedPlatforms).not.toContain('duckdb-wasm');
      expect(db.requiresProxy).toBe(true);
    });
  });

  describe('createUrlBasedRemoteDB', () => {
    it('should create MotherDuck database correctly', () => {
      const id = makePersistentDataSourceId();
      const db = createUrlBasedRemoteDB(
        id,
        'md:my_motherduck_db',
        'motherduck_db',
        'MotherDuck cloud database'
      );

      expect(db.type).toBe('remote-db');
      expect(db.id).toBe(id);
      expect(db.connectionType).toBe('motherduck');
      expect(db.legacyUrl).toBe('md:my_motherduck_db');
      expect(db.dbName).toBe('motherduck_db');
      expect(db.queryEngineType).toBe('duckdb');
      expect(db.supportedPlatforms).toContain('duckdb-wasm');
      expect(db.supportedPlatforms).toContain('duckdb-tauri');
      expect(db.requiresProxy).toBe(false);
      expect(db.comment).toBe('MotherDuck cloud database');
    });

    it('should create S3 database correctly', () => {
      const id = makePersistentDataSourceId();
      const db = createUrlBasedRemoteDB(
        id,
        's3://my-bucket/data.duckdb',
        's3_db'
      );

      expect(db.connectionType).toBe('s3');
      expect(db.legacyUrl).toBe('s3://my-bucket/data.duckdb');
      expect(db.supportedPlatforms).toContain('duckdb-wasm');
      expect(db.supportedPlatforms).toContain('duckdb-tauri');
    });

    it('should create HTTPS database correctly', () => {
      const id = makePersistentDataSourceId();
      const db = createUrlBasedRemoteDB(
        id,
        'https://example.com/db.duckdb',
        'https_db'
      );

      expect(db.connectionType).toBe('http');
      expect(db.legacyUrl).toBe('https://example.com/db.duckdb');
    });

    it('should default to url type for generic URLs', () => {
      const id = makePersistentDataSourceId();
      const db = createUrlBasedRemoteDB(
        id,
        'ftp://example.com/db.duckdb',
        'ftp_db'
      );

      expect(db.connectionType).toBe('url');
      expect(db.legacyUrl).toBe('ftp://example.com/db.duckdb');
    });
  });
});