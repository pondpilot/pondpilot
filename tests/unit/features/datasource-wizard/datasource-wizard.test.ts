import { describe, it, expect } from '@jest/globals';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { validateRemoteDatabaseUrl } from '@utils/remote-database';
import { buildAttachQuery } from '@utils/sql-builder';

// Since we're in a Node test environment, we'll test the logic and utility functions
// rather than the React component rendering

describe('Datasource Wizard Utilities', () => {
  describe('buildAttachQuery', () => {
    it('should build basic ATTACH query', () => {
      const query = buildAttachQuery('/path/to/database.duckdb', 'mydb');
      expect(query).toBe("ATTACH '/path/to/database.duckdb' AS mydb");
    });

    it('should build ATTACH query with read-only option', () => {
      const query = buildAttachQuery('/path/to/database.duckdb', 'mydb', { readOnly: true });
      expect(query).toBe("ATTACH '/path/to/database.duckdb' AS mydb (READ_ONLY)");
    });

    it('should handle URLs as file paths', () => {
      const query = buildAttachQuery('https://example.com/db.duckdb', 'remote_db');
      expect(query).toBe("ATTACH 'https://example.com/db.duckdb' AS remote_db");
    });

    it('should handle S3 URLs', () => {
      const query = buildAttachQuery('s3://bucket/path/to/db.duckdb', 's3_db');
      expect(query).toBe("ATTACH 's3://bucket/path/to/db.duckdb' AS s3_db");
    });
  });

  describe('validateRemoteDatabaseUrl', () => {
    it('should validate HTTPS URLs', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/data.parquet');
      expect(result.isValid).toBe(true);
    });

    it('should validate S3 URLs', () => {
      const result = validateRemoteDatabaseUrl('s3://bucket/path/to/data.parquet');
      expect(result.isValid).toBe(true);
    });

    it('should validate Google Cloud Storage URLs', () => {
      const result = validateRemoteDatabaseUrl('gcs://bucket/path/to/data.parquet');
      expect(result.isValid).toBe(true);
    });

    it('should validate Azure Blob Storage URLs', () => {
      const result = validateRemoteDatabaseUrl(
        'https://account.blob.core.windows.net/container/data.parquet',
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid URLs', () => {
      const result = validateRemoteDatabaseUrl('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject unsupported protocols', () => {
      const result = validateRemoteDatabaseUrl('ftp://example.com/data.parquet');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject empty URLs', () => {
      const result = validateRemoteDatabaseUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
  });

  describe('toDuckDBIdentifier', () => {
    it('should return simple identifiers as-is', () => {
      expect(toDuckDBIdentifier('mydb')).toBe('mydb');
      expect(toDuckDBIdentifier('test_db')).toBe('test_db');
      expect(toDuckDBIdentifier('db123')).toBe('db123');
    });

    it('should quote identifiers with special characters', () => {
      expect(toDuckDBIdentifier('my-db')).toBe('"my-db"');
      expect(toDuckDBIdentifier('my db')).toBe('"my db"');
      expect(toDuckDBIdentifier('db.name')).toBe('"db.name"');
    });

    it('should escape double quotes in identifiers', () => {
      expect(toDuckDBIdentifier('my"db')).toBe('"my""db"');
      expect(toDuckDBIdentifier('test"quoted"db')).toBe('"test""quoted""db"');
    });

    it('should quote reserved keywords', () => {
      expect(toDuckDBIdentifier('select')).toBe('"select"');
      expect(toDuckDBIdentifier('database')).toBe('"database"');
      expect(toDuckDBIdentifier('table')).toBe('"table"');
    });
  });
});

describe('Datasource Wizard Integration', () => {
  describe('Remote Database Attachment', () => {
    it('should build correct query for read-only remote database', () => {
      const url = 'https://example.com/data.parquet';
      const dbName = 'remote_data';

      // Validate URL first
      const validation = validateRemoteDatabaseUrl(url);
      expect(validation.isValid).toBe(true);

      // Build attach query
      const query = buildAttachQuery(url, dbName, { readOnly: true });
      expect(query).toBe("ATTACH 'https://example.com/data.parquet' AS remote_data (READ_ONLY)");
    });

    it('should handle database names that need escaping', () => {
      const url = 's3://bucket/data.parquet';
      const dbName = 'my-remote-db';

      // Validate URL
      const validation = validateRemoteDatabaseUrl(url);
      expect(validation.isValid).toBe(true);

      // Build attach query - the buildAttachQuery should use toDuckDBIdentifier internally
      const query = buildAttachQuery(url, dbName, { readOnly: false });
      expect(query).toBe('ATTACH \'s3://bucket/data.parquet\' AS "my-remote-db"');
    });

    it('should prevent SQL injection in database names', () => {
      const url = 'https://example.com/data.parquet';
      const maliciousDbName = 'mydb; DROP TABLE users; --';

      // The buildAttachQuery should safely escape the database name
      const query = buildAttachQuery(url, maliciousDbName);
      expect(query).toBe(
        'ATTACH \'https://example.com/data.parquet\' AS "mydb; DROP TABLE users; --"',
      );

      // The malicious SQL is safely contained within quotes
      // The query does contain the text but it's safely escaped within quotes
      expect(query).toContain('"mydb; DROP TABLE users; --"');
      // Verify it's properly quoted and won't be executed as SQL
      expect(query).toMatch(/AS "[^"]*DROP TABLE users[^"]*"$/);
    });
  });

  describe('Database Readiness Check', () => {
    it('should build correct query to check if database is attached', () => {
      const dbName = 'test_db';
      const escapedDbName = toDuckDBIdentifier(dbName);
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${escapedDbName}`;

      expect(checkQuery).toBe(
        'SELECT database_name FROM duckdb_databases WHERE database_name = test_db',
      );
    });

    it('should escape database names in readiness check', () => {
      const dbName = 'test-db';
      const escapedDbName = toDuckDBIdentifier(dbName);
      const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${escapedDbName}`;

      expect(checkQuery).toBe(
        'SELECT database_name FROM duckdb_databases WHERE database_name = "test-db"',
      );
    });
  });
});
