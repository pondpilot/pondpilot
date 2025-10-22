import { describe, it, expect } from '@jest/globals';

/**
 * ATTACH statement regex pattern from script-tab-view.tsx
 *
 * Supports: ATTACH [DATABASE] [IF NOT EXISTS] 'url' AS ["]dbname["]
 *
 * Capture groups:
 * 1: The database URL (required, quoted)
 * 2: Optional opening quote for the database name (captures " or empty string)
 * 3: The database name (required, optionally quoted)
 */
const ATTACH_STATEMENT_REGEX =
  /ATTACH\s+(?:DATABASE\s+)?(?:IF\s+NOT\s+EXISTS\s+)?['"]([^'"]+)['"]\s+AS\s+(['"]?)([^'"\s]+)\2/i;

describe('ATTACH_STATEMENT_REGEX', () => {
  describe('basic ATTACH statements', () => {
    it('should match simple ATTACH with single quotes', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![2]).toBe('');
      expect(match![3]).toBe('mydb');
    });

    it('should match simple ATTACH with double quotes for URL', () => {
      const sql = 'ATTACH "https://example.com/db.duckdb" AS mydb';
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![2]).toBe('');
      expect(match![3]).toBe('mydb');
    });

    it('should match ATTACH with quoted database name', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS \"mydb\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![2]).toBe('"');
      expect(match![3]).toBe('mydb');
    });

    it('should match ATTACH with single-quoted database name', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS 'mydb'";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![2]).toBe("'");
      expect(match![3]).toBe('mydb');
    });
  });

  describe('ATTACH DATABASE keyword', () => {
    it('should match ATTACH DATABASE with single quotes', () => {
      const sql = "ATTACH DATABASE 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match ATTACH DATABASE with double quotes', () => {
      const sql = 'ATTACH DATABASE "https://example.com/db.duckdb" AS mydb';
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match ATTACH DATABASE with quoted db name', () => {
      const sql = "ATTACH DATABASE 'https://example.com/db.duckdb' AS \"my-db\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('my-db');
    });
  });

  describe('IF NOT EXISTS clause', () => {
    it('should match ATTACH IF NOT EXISTS', () => {
      const sql = "ATTACH IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match ATTACH DATABASE IF NOT EXISTS', () => {
      const sql = "ATTACH DATABASE IF NOT EXISTS 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match with IF NOT EXISTS and quoted db name', () => {
      const sql = "ATTACH IF NOT EXISTS 'https://example.com/db.duckdb' AS \"my-db\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('my-db');
    });
  });

  describe('case insensitivity', () => {
    it('should match lowercase attach', () => {
      const sql = "attach 'https://example.com/db.duckdb' as mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match mixed case ATTACH DATABASE', () => {
      const sql = "AtTaCh DaTaBaSe 'https://example.com/db.duckdb' As mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match mixed case IF NOT EXISTS', () => {
      const sql = "attach iF NoT eXiStS 'https://example.com/db.duckdb' as mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });
  });

  describe('various URL formats', () => {
    it('should match http URLs', () => {
      const sql = "ATTACH 'http://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('http://example.com/db.duckdb');
    });

    it('should match https URLs', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
    });

    it('should match s3 URLs', () => {
      const sql = "ATTACH 's3://bucket/path/to/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('s3://bucket/path/to/db.duckdb');
    });

    it('should match gcs URLs', () => {
      const sql = "ATTACH 'gcs://bucket/path/to/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('gcs://bucket/path/to/db.duckdb');
    });

    it('should match azure URLs', () => {
      const sql = "ATTACH 'azure://container/path/to/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('azure://container/path/to/db.duckdb');
    });

    it('should match URLs with query parameters', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb?key=value&foo=bar' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb?key=value&foo=bar');
    });

    it('should match URLs with port numbers', () => {
      const sql = "ATTACH 'https://example.com:8080/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com:8080/db.duckdb');
    });

    it('should match URLs with authentication', () => {
      const sql = "ATTACH 'https://user:pass@example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://user:pass@example.com/db.duckdb');
    });

    it('should match URLs with hash fragments', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb#section' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb#section');
    });

    it('should match local file paths', () => {
      const sql = "ATTACH '/path/to/local/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('/path/to/local/db.duckdb');
    });

    it('should match Windows-style paths', () => {
      const sql = "ATTACH 'C:\\path\\to\\db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('C:\\path\\to\\db.duckdb');
    });

    it('should match proxy: prefixed URLs', () => {
      const sql = "ATTACH 'proxy:https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('proxy:https://example.com/db.duckdb');
    });
  });

  describe('database name variations', () => {
    it('should match simple alphanumeric database names', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb123";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![3]).toBe('mydb123');
    });

    it('should match database names with underscores', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS my_db";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![3]).toBe('my_db');
    });

    it('should match quoted database names with hyphens', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS \"my-db\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![3]).toBe('my-db');
    });

    it('should not match database names with unquoted spaces', () => {
      // Database names with spaces must be quoted
      // The regex pattern [^'"\s]+ means it won't match spaces in the db name
      const sql = "ATTACH 'https://example.com/db.duckdb' AS \"my db\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      // This will fail because [^'"\s]+ stops at the space
      expect(match).toBeNull();
    });

    it('should match quoted database names with dots', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS \"my.db\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![3]).toBe('my.db');
    });

    it('should match single-quoted database names with special chars', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS 'my-special-db'";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![3]).toBe('my-special-db');
    });
  });

  describe('whitespace handling', () => {
    it('should match with multiple spaces', () => {
      const sql = "ATTACH    'https://example.com/db.duckdb'    AS    mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match with tabs', () => {
      const sql = "ATTACH\t'https://example.com/db.duckdb'\tAS\tmydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match with newlines in whitespace', () => {
      const sql = "ATTACH\n'https://example.com/db.duckdb'\nAS\nmydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match with mixed whitespace', () => {
      const sql = "ATTACH  \t\n  'https://example.com/db.duckdb'  \t  AS  \n  mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });
  });

  describe('quote consistency validation', () => {
    it('should use backreference to match quote pairs', () => {
      // The regex uses \2 to ensure opening and closing quotes match
      const sql1 = "ATTACH 'https://example.com/db.duckdb' AS \"mydb\"";
      const match1 = sql1.match(ATTACH_STATEMENT_REGEX);
      expect(match1).not.toBeNull();

      const sql2 = "ATTACH 'https://example.com/db.duckdb' AS 'mydb'";
      const match2 = sql2.match(ATTACH_STATEMENT_REGEX);
      expect(match2).not.toBeNull();

      // Both should work because backreference matches the captured quote
    });

    it('should match unquoted database names', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![2]).toBe(''); // No opening quote
      expect(match![3]).toBe('mydb');
    });
  });

  describe('edge cases and invalid patterns', () => {
    it('should not match ATTACH without AS clause', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb'";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).toBeNull();
    });

    it('should not match without URL quotes', () => {
      const sql = 'ATTACH https://example.com/db.duckdb AS mydb';
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).toBeNull();
    });

    it('should match with mismatched URL quotes (regex limitation)', () => {
      // The regex uses ['"] which matches either quote independently
      // It doesn't validate that opening and closing quotes match for the URL
      const sql = 'ATTACH "https://example.com/db.duckdb\' AS mydb';
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      // This will actually match because ['"] matches any quote
      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
    });

    it('should include trailing semicolons in db name (regex limitation)', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb;";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      // The regex pattern [^'"\s]+ captures anything except quotes and whitespace
      // So the semicolon will be captured as part of the database name
      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb;');
    });

    it('should handle SQL comments after statement', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb -- my database";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should match with read-only option', () => {
      // Note: The regex doesn't capture options, but it should still match the core statement
      const sql = "ATTACH 'https://example.com/db.duckdb' AS mydb (READ_ONLY)";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/db.duckdb');
      expect(match![3]).toBe('mydb');
    });

    it('should handle empty database name (should not match)', () => {
      const sql = "ATTACH 'https://example.com/db.duckdb' AS ''";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).toBeNull();
    });

    it('should handle URLs with spaces in path (quoted properly)', () => {
      const sql = "ATTACH 'https://example.com/my database/db.duckdb' AS mydb";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/my database/db.duckdb');
    });
  });

  describe('real-world examples', () => {
    it('should match chinook database attachment', () => {
      const sql = "ATTACH 'https://cdn.example.com/chinook.db' AS chinook";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://cdn.example.com/chinook.db');
      expect(match![3]).toBe('chinook');
    });

    it('should match S3 parquet file', () => {
      const sql = "ATTACH 's3://my-bucket/data/sales.duckdb' AS sales_db";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('s3://my-bucket/data/sales.duckdb');
      expect(match![3]).toBe('sales_db');
    });

    it('should match GCS database with special naming', () => {
      const sql = "ATTACH 'gcs://analytics-prod/dbs/customer-360.duckdb' AS \"customer-360\"";
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('gcs://analytics-prod/dbs/customer-360.duckdb');
      expect(match![3]).toBe('customer-360');
    });

    it('should match complex multi-line statement', () => {
      const sql = `
        ATTACH DATABASE IF NOT EXISTS
          'https://example.com/prod/analytics.duckdb'
        AS "prod-analytics"
      `;
      const match = sql.match(ATTACH_STATEMENT_REGEX);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://example.com/prod/analytics.duckdb');
      expect(match![3]).toBe('prod-analytics');
    });
  });
});
