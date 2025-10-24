import { describe, it, expect, beforeEach } from '@jest/globals';
import { rewriteAttachUrl } from '@utils/attach-cors-rewriter';

describe('attach-cors-rewriter', () => {
  beforeEach(() => {
    // Reset global mock environment before each test
    if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
      (global as any).import.meta.env.VITE_CORS_PROXY_URL = undefined;
      (global as any).import.meta.env.DEV = false;
    }
  });

  describe('rewriteAttachUrl', () => {
    describe('S3 URL handling', () => {
      it('should convert S3 URL to HTTPS when forceWrap is true', () => {
        const query = "ATTACH 's3://pondpilot/chinook.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should be rewritten
        expect(result.wasRewritten).toBe(true);

        // Should NOT contain the s3:// protocol (should be converted to https://)
        expect(result.rewritten).not.toContain('s3://');
        expect(result.rewritten).not.toContain('s3%3A%2F%2F');

        // Should contain the HTTPS URL wrapped with proxy
        expect(result.rewritten).toContain('pondpilot.s3.amazonaws.com');
        expect(result.rewritten).toContain('/proxy?url=');
      });

      it('should convert S3 URL to HTTPS with explicit proxy: prefix', () => {
        const query = "ATTACH 'proxy:s3://pondpilot/chinook.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, false);

        // Should be rewritten
        expect(result.wasRewritten).toBe(true);

        // Should NOT contain the s3:// protocol (should be converted to https://)
        expect(result.rewritten).not.toContain('s3://');
        expect(result.rewritten).not.toContain('s3%3A%2F%2F');

        // Should contain the HTTPS URL wrapped with proxy
        expect(result.rewritten).toContain('pondpilot.s3.amazonaws.com');
        expect(result.rewritten).toContain('/proxy?url=');
      });

      it('should not wrap S3 URL when forceWrap is false and no proxy prefix', () => {
        const query = "ATTACH 's3://pondpilot/chinook.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, false);

        // Should not be rewritten
        expect(result.wasRewritten).toBe(false);

        // Should keep original s3:// URL
        expect(result.rewritten).toBe(query);
      });

      it('should handle S3 URLs with dotted bucket names', () => {
        const query = "ATTACH 's3://my.dotted.bucket/data.csv' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should be rewritten
        expect(result.wasRewritten).toBe(true);

        // Should use path-style URL (for dotted buckets)
        // URL will be encoded, so check for encoded version
        expect(result.rewritten).toContain('s3.amazonaws.com');
        expect(result.rewritten).toContain('my.dotted.bucket');
        expect(result.rewritten).not.toContain('s3://');
      });

      it('should handle S3 URLs with query parameters', () => {
        const query = "ATTACH 's3://mybucket/file.csv?versionId=abc123' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should be rewritten
        expect(result.wasRewritten).toBe(true);

        // Should preserve query parameters (will be URL-encoded)
        expect(result.rewritten).toContain('versionId');
        expect(result.rewritten).toContain('abc123');
        expect(result.rewritten).not.toContain('s3://');
      });
    });

    describe('GCS and Azure URL handling', () => {
      it('should not wrap native GCS URLs even with forceWrap', () => {
        const query = "ATTACH 'gcs://bucket/data.parquet' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should keep original URL (native protocol can't be proxied)
        expect(result.rewritten).toBe(query);
      });

      it('should not wrap native Azure URLs even with forceWrap', () => {
        const query = "ATTACH 'azure://container/data.parquet' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should keep original URL (native protocol can't be proxied)
        expect(result.rewritten).toBe(query);
      });

      it('should not wrap native GCS URLs even with proxy prefix', () => {
        const query = "ATTACH 'proxy:gcs://bucket/data.parquet' AS mydb";
        const result = rewriteAttachUrl(query, false);

        // Native protocols can't be proxied, so they're returned as-is
        // The proxy: prefix is stripped, so the URL is cleaned
        expect(result.rewritten).toBe("ATTACH 'gcs://bucket/data.parquet' AS mydb");
      });
    });

    describe('HTTPS URL handling', () => {
      it('should wrap HTTPS URL when forceWrap is true', () => {
        const query = "ATTACH 'https://example.com/db.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).toContain('/proxy?url=');
        expect(result.rewritten).toContain('example.com');
      });

      it('should wrap HTTPS URL with explicit proxy prefix', () => {
        const query = "ATTACH 'proxy:https://example.com/db.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, false);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).toContain('/proxy?url=');
      });

      it('should not wrap HTTPS URL when forceWrap is false and no proxy prefix', () => {
        const query = "ATTACH 'https://example.com/db.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, false);

        expect(result.wasRewritten).toBe(false);
        expect(result.rewritten).toBe(query);
      });

      it('should not double-wrap already proxied URLs', () => {
        const query =
          "ATTACH 'https://cors-proxy.pondpilot.io/proxy?url=https%3A%2F%2Fexample.com%2Fdb.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, true);

        // Should mark as rewritten but not double-wrap
        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).not.toContain('proxy?url=https%3A%2F%2Fcors-proxy');
      });
    });

    describe('non-ATTACH statements', () => {
      it('should not modify SELECT statements', () => {
        const query = "SELECT * FROM 's3://bucket/data.csv'";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(false);
        expect(result.rewritten).toBe(query);
      });

      it('should not modify CREATE TABLE statements', () => {
        const query = "CREATE TABLE test AS SELECT * FROM 'https://example.com/data.csv'";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(false);
        expect(result.rewritten).toBe(query);
      });
    });

    describe('edge cases', () => {
      it('should handle double-quoted URLs', () => {
        const query = 'ATTACH "s3://pondpilot/chinook.duckdb" AS mydb';
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).not.toContain('s3://');
        expect(result.rewritten).toContain('pondpilot.s3.amazonaws.com');
      });

      it('should handle mixed quotes (should not match)', () => {
        const query = 'ATTACH \'s3://bucket/data.csv" AS mydb';
        const result = rewriteAttachUrl(query, true);

        // Regex shouldn't match mismatched quotes
        expect(result.wasRewritten).toBe(false);
      });

      it('should handle case-insensitive ATTACH keyword', () => {
        const query = "attach 's3://pondpilot/chinook.duckdb' as mydb";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).not.toContain('s3://');
      });

      it('should handle ATTACH with extra whitespace', () => {
        const query = "ATTACH    's3://pondpilot/chinook.duckdb'   AS mydb";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).not.toContain('s3://');
      });
    });

    describe('S3 HTTPS URLs (not native s3://)', () => {
      it('should wrap S3 HTTPS URLs when forceWrap is true', () => {
        const query =
          "ATTACH 'https://pondpilot.s3.us-east-2.amazonaws.com/chinook.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, true);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).toContain('/proxy?url=');
      });

      it('should wrap S3 HTTPS URLs with proxy prefix', () => {
        const query =
          "ATTACH 'proxy:https://pondpilot.s3.us-east-2.amazonaws.com/chinook.duckdb' AS mydb";
        const result = rewriteAttachUrl(query, false);

        expect(result.wasRewritten).toBe(true);
        expect(result.rewritten).toContain('/proxy?url=');
      });
    });
  });
});
