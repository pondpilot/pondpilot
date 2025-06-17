import { describe, it, expect, jest } from '@jest/globals';
import {
  buildAttachQuery,
  buildDetachQuery,
  buildDropViewQuery,
  buildCreateViewQuery,
} from '@utils/sql-builder';

// Mock the helper functions
jest.mock('@utils/duckdb/identifier', () => ({
  toDuckDBIdentifier: jest.fn((str: string) => {
    // Simple mock implementation that just quotes identifiers
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)) {
      return str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  }),
}));

jest.mock('@utils/helpers', () => ({
  quote: jest.fn((s: string, options: { single?: boolean } = { single: false }) => {
    if (options.single) {
      return `'${s.replace(/'/g, "''")}'`;
    }
    return `"${s.replace(/"/g, '""')}"`;
  }),
}));

describe('sql-builder', () => {
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

    it('should handle empty database name', () => {
      const query = buildAttachQuery('/path/to/db.duckdb', '');
      expect(query).toBe('ATTACH \'/path/to/db.duckdb\' AS ""');
    });

    it('should handle special characters in paths', () => {
      const query = buildAttachQuery('/path/with spaces/and-dashes/db.duckdb', 'mydb');
      expect(query).toBe("ATTACH '/path/with spaces/and-dashes/db.duckdb' AS mydb");
    });
  });

  describe('buildDetachQuery', () => {
    it('should build basic DETACH query with IF EXISTS', () => {
      const query = buildDetachQuery('mydb');
      expect(query).toBe('DETACH DATABASE IF EXISTS mydb');
    });

    it('should build DETACH query without IF EXISTS', () => {
      const query = buildDetachQuery('mydb', false);
      expect(query).toBe('DETACH DATABASE mydb');
    });

    it('should handle database names that need quoting', () => {
      const query = buildDetachQuery('my-database-123');
      expect(query).toBe('DETACH DATABASE IF EXISTS "my-database-123"');
    });

    it('should handle valid identifier database names', () => {
      const query = buildDetachQuery('select_db');
      expect(query).toBe('DETACH DATABASE IF EXISTS select_db');
    });

    it('should handle empty database name', () => {
      const query = buildDetachQuery('');
      expect(query).toBe('DETACH DATABASE IF EXISTS ""');
    });

    it('should handle database names with quotes', () => {
      const query = buildDetachQuery('my"quoted"db');
      expect(query).toBe('DETACH DATABASE IF EXISTS "my""quoted""db"');
    });
  });

  describe('buildDropViewQuery', () => {
    it('should build basic DROP VIEW query with IF EXISTS', () => {
      const query = buildDropViewQuery('my_view');
      expect(query).toBe('DROP VIEW IF EXISTS my_view');
    });

    it('should build DROP VIEW query without IF EXISTS', () => {
      const query = buildDropViewQuery('my_view', false);
      expect(query).toBe('DROP VIEW my_view');
    });

    it('should handle view names that need quoting', () => {
      const query = buildDropViewQuery('my-view-123');
      expect(query).toBe('DROP VIEW IF EXISTS "my-view-123"');
    });

    it('should handle view names with spaces', () => {
      const query = buildDropViewQuery('my view name');
      expect(query).toBe('DROP VIEW IF EXISTS "my view name"');
    });

    it('should handle empty view name', () => {
      const query = buildDropViewQuery('');
      expect(query).toBe('DROP VIEW IF EXISTS ""');
    });

    it('should handle view names with special characters', () => {
      const query = buildDropViewQuery('view$with%special@chars');
      expect(query).toBe('DROP VIEW IF EXISTS "view$with%special@chars"');
    });
  });

  describe('buildCreateViewQuery', () => {
    it('should build basic CREATE OR REPLACE VIEW query', () => {
      const query = buildCreateViewQuery('my_view', 'SELECT * FROM my_table');
      expect(query).toBe('CREATE OR REPLACE VIEW my_view AS SELECT * FROM my_table');
    });

    it('should build CREATE VIEW query without REPLACE', () => {
      const query = buildCreateViewQuery('my_view', 'SELECT * FROM my_table', false);
      expect(query).toBe('CREATE VIEW my_view AS SELECT * FROM my_table');
    });

    it('should handle view names that need quoting', () => {
      const query = buildCreateViewQuery('my-view-123', 'SELECT 1');
      expect(query).toBe('CREATE OR REPLACE VIEW "my-view-123" AS SELECT 1');
    });

    it('should handle complex SELECT queries', () => {
      const selectQuery = `
        SELECT 
          a.id,
          b.name,
          COUNT(*) as total
        FROM table_a a
        JOIN table_b b ON a.id = b.a_id
        WHERE a.status = 'active'
        GROUP BY a.id, b.name
      `;
      const query = buildCreateViewQuery('complex_view', selectQuery);
      expect(query).toBe(`CREATE OR REPLACE VIEW complex_view AS ${selectQuery}`);
    });

    it('should handle view names with spaces', () => {
      const query = buildCreateViewQuery('my view name', 'SELECT 1');
      expect(query).toBe('CREATE OR REPLACE VIEW "my view name" AS SELECT 1');
    });

    it('should handle empty view name', () => {
      const query = buildCreateViewQuery('', 'SELECT 1');
      expect(query).toBe('CREATE OR REPLACE VIEW "" AS SELECT 1');
    });

    it('should not escape the SELECT query content', () => {
      const selectQuery = "SELECT col1, 'string with quotes' FROM table";
      const query = buildCreateViewQuery('my_view', selectQuery);
      expect(query).toBe(`CREATE OR REPLACE VIEW my_view AS ${selectQuery}`);
    });

    it('should handle view names with dots (schema qualified)', () => {
      const query = buildCreateViewQuery('schema.view_name', 'SELECT 1');
      expect(query).toBe('CREATE OR REPLACE VIEW "schema.view_name" AS SELECT 1');
    });
  });

  describe('SQL injection prevention', () => {
    it('should prevent SQL injection in file paths', () => {
      const maliciousPath = "'; DROP TABLE users; --";
      const query = buildAttachQuery(maliciousPath, 'safe_db');
      expect(query).toBe("ATTACH '''; DROP TABLE users; --' AS safe_db");
      // The malicious SQL is safely escaped within quotes
    });

    it('should prevent SQL injection in database names', () => {
      const maliciousDbName = 'mydb; DROP TABLE users; --';
      const query = buildDetachQuery(maliciousDbName);
      expect(query).toBe('DETACH DATABASE IF EXISTS "mydb; DROP TABLE users; --"');
      // The malicious SQL is safely escaped within quotes
    });

    it('should prevent SQL injection in view names', () => {
      const maliciousViewName = 'my_view; DROP TABLE users; --';
      const query = buildDropViewQuery(maliciousViewName);
      expect(query).toBe('DROP VIEW IF EXISTS "my_view; DROP TABLE users; --"');
      // The malicious SQL is safely escaped within quotes
    });

    it('should handle attempts to break out of quotes', () => {
      const breakOutPath = "test'; ATTACH 'evil.db' AS evil; --";
      const query = buildAttachQuery(breakOutPath, 'safe_db');
      expect(query).toBe("ATTACH 'test''; ATTACH ''evil.db'' AS evil; --' AS safe_db");
      // Single quotes are properly doubled, preventing breakout
    });
  });
});
