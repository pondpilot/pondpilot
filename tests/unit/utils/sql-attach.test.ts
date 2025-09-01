import { describe, it, expect } from '@jest/globals';
import {
  buildAttachQuery,
  buildDetachQuery,
  parseAttachStatement,
  isValidDatabaseName,
} from '@utils/sql-attach';

describe('sql-attach', () => {
  describe('buildAttachQuery', () => {
    it('should build basic ATTACH query', () => {
      const query = buildAttachQuery('/path/to/database.duckdb', 'mydb');
      expect(query).toBe("ATTACH '/path/to/database.duckdb' AS mydb");
    });

    it('should build ATTACH query with read-only option', () => {
      const query = buildAttachQuery('/path/to/database.duckdb', 'mydb', { readOnly: true });
      expect(query).toBe("ATTACH '/path/to/database.duckdb' AS mydb (READ_ONLY)");
    });

    it('should properly escape file paths with single quotes', () => {
      const query = buildAttachQuery("/path/with'quote/db.duckdb", 'mydb');
      expect(query).toBe("ATTACH '/path/with''quote/db.duckdb' AS mydb");
    });

    it('should handle database names that need quoting', () => {
      const query = buildAttachQuery('/path/to/db.duckdb', 'my-database-123');
      expect(query).toBe('ATTACH \'/path/to/db.duckdb\' AS "my-database-123"');
    });

    it('should handle URLs as file paths', () => {
      const query = buildAttachQuery('https://example.com/db.duckdb', 'remote_db');
      expect(query).toBe("ATTACH 'https://example.com/db.duckdb' AS remote_db");
    });

    it('should handle S3 URLs', () => {
      const query = buildAttachQuery('s3://bucket/path/to/db.duckdb', 's3_db');
      expect(query).toBe("ATTACH 's3://bucket/path/to/db.duckdb' AS s3_db");
    });

    it('should handle MotherDuck URLs', () => {
      const query = buildAttachQuery('md:my_database', 'motherduck_db');
      expect(query).toBe("ATTACH 'md:my_database' AS motherduck_db");
    });

    it('should prevent SQL injection in file paths', () => {
      const maliciousPath = "'; DROP TABLE users; --";
      const query = buildAttachQuery(maliciousPath, 'safe_db');
      expect(query).toBe("ATTACH '''; DROP TABLE users; --' AS safe_db");
      // The malicious SQL is safely escaped within quotes
    });
  });

  describe('buildDetachQuery', () => {
    it('should build DETACH query with IF EXISTS by default', () => {
      const query = buildDetachQuery('mydb');
      expect(query).toBe('DETACH DATABASE IF EXISTS mydb');
    });

    it('should build DETACH query without IF EXISTS when specified', () => {
      const query = buildDetachQuery('mydb', false);
      expect(query).toBe('DETACH DATABASE mydb');
    });

    it('should handle database names that need quoting', () => {
      const query = buildDetachQuery('my-database-123');
      expect(query).toBe('DETACH DATABASE IF EXISTS "my-database-123"');
    });
  });

  describe('parseAttachStatement', () => {
    it('should parse basic ATTACH statement with HTTP URL', () => {
      const result = parseAttachStatement("ATTACH 'https://example.com/data.duckdb' AS mydb");
      expect(result).toEqual({
        url: 'https://example.com/data.duckdb',
        dbName: 'mydb',
      });
    });

    it('should parse ATTACH statement with S3 URL', () => {
      const result = parseAttachStatement("ATTACH 's3://bucket/path/data.parquet' AS s3_data");
      expect(result).toEqual({
        url: 's3://bucket/path/data.parquet',
        dbName: 's3_data',
      });
    });

    it('should parse ATTACH statement with MotherDuck URL', () => {
      const result = parseAttachStatement("ATTACH 'md:my_database' AS motherduck");
      expect(result).toEqual({
        url: 'md:my_database',
        dbName: 'motherduck',
      });
    });

    it('should parse ATTACH with quoted database name', () => {
      const result = parseAttachStatement('ATTACH \'https://example.com/db\' AS "my-db-name"');
      expect(result).toEqual({
        url: 'https://example.com/db',
        dbName: 'my-db-name',
      });
    });

    it('should handle case-insensitive ATTACH keyword', () => {
      const result = parseAttachStatement("attach 'https://example.com/db' as mydb");
      expect(result).toEqual({
        url: 'https://example.com/db',
        dbName: 'mydb',
      });
    });

    it('should return null for local file paths', () => {
      const result = parseAttachStatement("ATTACH '/local/path/db.duckdb' AS localdb");
      expect(result).toBeNull();
    });

    it('should return null for invalid URL schemes', () => {
      const result = parseAttachStatement("ATTACH 'ftp://example.com/db' AS ftpdb");
      expect(result).toBeNull();
    });

    it('should return null for invalid database names', () => {
      const result = parseAttachStatement('ATTACH \'https://example.com/db\' AS "db; DROP TABLE"');
      expect(result).toBeNull();
    });

    it('should return null for malformed ATTACH statements', () => {
      expect(parseAttachStatement('SELECT * FROM table')).toBeNull();
      expect(parseAttachStatement('ATTACH WITHOUT AS')).toBeNull();
      expect(parseAttachStatement('ATTACH database')).toBeNull();
    });

    it('should handle GCS URLs', () => {
      const result = parseAttachStatement("ATTACH 'gcs://bucket/path/data.parquet' AS gcs_data");
      expect(result).toEqual({
        url: 'gcs://bucket/path/data.parquet',
        dbName: 'gcs_data',
      });
    });

    it('should handle Azure URLs', () => {
      const result = parseAttachStatement(
        "ATTACH 'azure://container/path/data.parquet' AS azure_data",
      );
      expect(result).toEqual({
        url: 'azure://container/path/data.parquet',
        dbName: 'azure_data',
      });
    });
  });

  describe('isValidDatabaseName', () => {
    it('should accept valid database names', () => {
      expect(isValidDatabaseName('mydb')).toBe(true);
      expect(isValidDatabaseName('my_database')).toBe(true);
      expect(isValidDatabaseName('db123')).toBe(true);
      expect(isValidDatabaseName('my-db-2024')).toBe(true);
      expect(isValidDatabaseName('DB_NAME_123')).toBe(true);
    });

    it('should reject invalid database names', () => {
      expect(isValidDatabaseName('my db')).toBe(false); // spaces
      expect(isValidDatabaseName('db;drop')).toBe(false); // semicolon
      expect(isValidDatabaseName('db--')).toBe(true); // double dash is OK
      expect(isValidDatabaseName('db/*comment*/')).toBe(false); // comment syntax
      expect(isValidDatabaseName("db'name")).toBe(false); // quotes
      expect(isValidDatabaseName('db"name')).toBe(false); // double quotes
      expect(isValidDatabaseName('')).toBe(false); // empty
      expect(isValidDatabaseName('db.name')).toBe(false); // dots
    });
  });
});
