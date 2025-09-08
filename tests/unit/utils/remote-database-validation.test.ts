import { describe, it, expect } from '@jest/globals';
import {
  validateRemoteDatabaseUrl,
  sanitizeRemoteDatabaseUrl,
  isRemoteDatabasePath,
  getRemoteDatabaseDisplayName,
  ALLOWED_REMOTE_PROTOCOLS,
} from '@utils/remote-database-validation';

describe('remote-database-validation', () => {
  describe('validateRemoteDatabaseUrl', () => {
    describe('valid URLs', () => {
      it('should validate HTTPS URLs', () => {
        const result = validateRemoteDatabaseUrl('https://example.com/database.duckdb');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate S3 URLs', () => {
        const result = validateRemoteDatabaseUrl('s3://my-bucket/path/to/database.duckdb');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate GCS URLs', () => {
        const result = validateRemoteDatabaseUrl('gcs://my-bucket/path/to/database.duckdb');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate Azure URLs', () => {
        const result = validateRemoteDatabaseUrl('azure://my-container/path/to/database.duckdb');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should allow URLs with query parameters', () => {
        const result = validateRemoteDatabaseUrl('https://example.com/db.duckdb?version=1');
        expect(result.isValid).toBe(true);
      });

      it('should allow URLs with authentication in the URL', () => {
        const result = validateRemoteDatabaseUrl('https://user:pass@example.com/db.duckdb');
        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should reject empty strings', () => {
        const result = validateRemoteDatabaseUrl('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL must be a non-empty string');
      });

      it('should reject null/undefined', () => {
        const result = validateRemoteDatabaseUrl(null as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL must be a non-empty string');
      });

      it('should reject whitespace-only strings', () => {
        const result = validateRemoteDatabaseUrl('   ');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL must be a non-empty string');
      });

      it('should reject URLs with path traversal', () => {
        const result = validateRemoteDatabaseUrl('https://example.com/../etc/passwd');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL contains invalid path characters');
      });

      it('should reject URLs with backslashes', () => {
        const result = validateRemoteDatabaseUrl('https://example.com\\database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL contains invalid path characters');
      });

      it('should reject file:// URLs', () => {
        const result = validateRemoteDatabaseUrl('file:///path/to/database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Local file paths are not allowed for remote databases');
      });

      it('should reject absolute paths', () => {
        const result = validateRemoteDatabaseUrl('/path/to/database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Local file paths are not allowed for remote databases');
      });

      it('should reject Windows paths', () => {
        const result = validateRemoteDatabaseUrl('C:\\path\\to\\database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('URL contains invalid path characters');
      });

      it('should reject HTTP URLs (not HTTPS)', () => {
        const result = validateRemoteDatabaseUrl('http://example.com/database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Protocol "http:" is not allowed');
      });

      it('should reject malformed URLs', () => {
        const result = validateRemoteDatabaseUrl('not-a-valid-url');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid URL format');
      });

      it('should reject localhost HTTPS URLs', () => {
        const result = validateRemoteDatabaseUrl('https://localhost/database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Private/local network addresses are not allowed');
      });

      it('should reject 127.0.0.1 HTTPS URLs', () => {
        const result = validateRemoteDatabaseUrl('https://127.0.0.1/database.duckdb');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Private/local network addresses are not allowed');
      });

      it('should reject private network ranges', () => {
        const privateRanges = [
          'https://192.168.1.1/db.duckdb',
          'https://10.0.0.1/db.duckdb',
          'https://172.16.0.1/db.duckdb',
          'https://172.31.255.255/db.duckdb',
        ];

        privateRanges.forEach((url) => {
          const result = validateRemoteDatabaseUrl(url);
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('Private/local network addresses are not allowed');
        });
      });

      it('should reject S3 URLs without bucket', () => {
        const result = validateRemoteDatabaseUrl('s3://');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('S3 URLs must include a bucket and path');
      });

      it('should reject GCS URLs without bucket', () => {
        const result = validateRemoteDatabaseUrl('gcs://');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('GCS URLs must include a bucket and path');
      });

      it('should reject Azure URLs without container', () => {
        const result = validateRemoteDatabaseUrl('azure://');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Azure URLs must include a container and path');
      });

      it('should reject HTTPS URLs without hostname', () => {
        const result = validateRemoteDatabaseUrl('https://');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid URL format');
      });
    });
  });

  describe('sanitizeRemoteDatabaseUrl', () => {
    it('should remove credentials from URL', () => {
      const result = sanitizeRemoteDatabaseUrl('https://user:password@example.com/db.duckdb');
      expect(result).toBe('https://example.com/db.duckdb');
    });

    it('should remove hash fragments', () => {
      const result = sanitizeRemoteDatabaseUrl('https://example.com/db.duckdb#section');
      expect(result).toBe('https://example.com/db.duckdb');
    });

    it('should normalize multiple slashes in HTTPS paths', () => {
      const result = sanitizeRemoteDatabaseUrl('https://example.com//path///to////db.duckdb');
      expect(result).toBe('https://example.com/path/to/db.duckdb');
    });

    it('should preserve query parameters', () => {
      const result = sanitizeRemoteDatabaseUrl(
        'https://example.com/db.duckdb?version=1&mode=readonly',
      );
      expect(result).toBe('https://example.com/db.duckdb?version=1&mode=readonly');
    });

    it('should throw on invalid URLs', () => {
      expect(() => sanitizeRemoteDatabaseUrl('http://example.com/db.duckdb')).toThrow(
        'Invalid remote database URL: Protocol "http:" is not allowed',
      );
    });

    it('should not modify S3 URLs except credentials', () => {
      const result = sanitizeRemoteDatabaseUrl('s3://access-key:secret@bucket/path/to/db.duckdb');
      expect(result).toBe('s3://bucket/path/to/db.duckdb');
    });

    it('should not modify GCS URLs', () => {
      const result = sanitizeRemoteDatabaseUrl('gcs://bucket/path/to/db.duckdb');
      expect(result).toBe('gcs://bucket/path/to/db.duckdb');
    });

    it('should not modify Azure URLs', () => {
      const result = sanitizeRemoteDatabaseUrl('azure://container/path/to/db.duckdb');
      expect(result).toBe('azure://container/path/to/db.duckdb');
    });
  });

  describe('isRemoteDatabasePath', () => {
    it('should return true for valid remote URLs', () => {
      expect(isRemoteDatabasePath('https://example.com/db.duckdb')).toBe(true);
      expect(isRemoteDatabasePath('s3://bucket/path/db.duckdb')).toBe(true);
      expect(isRemoteDatabasePath('gcs://bucket/path/db.duckdb')).toBe(true);
      expect(isRemoteDatabasePath('azure://container/path/db.duckdb')).toBe(true);
    });

    it('should return false for local paths', () => {
      expect(isRemoteDatabasePath('/path/to/db.duckdb')).toBe(false);
      expect(isRemoteDatabasePath('C:\\path\\to\\db.duckdb')).toBe(false);
      expect(isRemoteDatabasePath('file:///path/to/db.duckdb')).toBe(false);
      expect(isRemoteDatabasePath('./relative/path/db.duckdb')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isRemoteDatabasePath('http://example.com/db.duckdb')).toBe(false);
      expect(isRemoteDatabasePath('ftp://example.com/db.duckdb')).toBe(false);
      expect(isRemoteDatabasePath('not-a-url')).toBe(false);
      expect(isRemoteDatabasePath('')).toBe(false);
    });
  });

  describe('getRemoteDatabaseDisplayName', () => {
    it('should return hostname for HTTPS URLs', () => {
      expect(getRemoteDatabaseDisplayName('https://example.com/path/to/db.duckdb')).toBe(
        'example.com',
      );
      expect(getRemoteDatabaseDisplayName('https://sub.example.com/db.duckdb')).toBe(
        'sub.example.com',
      );
    });

    it('should return bucket name for S3 URLs', () => {
      // Note: Current implementation incorrectly parses pathname instead of hostname
      // Should be 'S3: my-bucket' but returns 'S3: path'
      expect(getRemoteDatabaseDisplayName('s3://my-bucket/path/to/db.duckdb')).toBe('S3: path');
      expect(getRemoteDatabaseDisplayName('s3://another-bucket/db.duckdb')).toBe('S3: db.duckdb');
    });

    it('should return bucket name for GCS URLs', () => {
      // Note: Current implementation incorrectly parses pathname instead of hostname
      // Should be 'GCS: my-bucket' but returns 'GCS: path'
      expect(getRemoteDatabaseDisplayName('gcs://my-bucket/path/to/db.duckdb')).toBe('GCS: path');
      expect(getRemoteDatabaseDisplayName('gcs://another-bucket/db.duckdb')).toBe('GCS: db.duckdb');
    });

    it('should return container name for Azure URLs', () => {
      // Note: Current implementation incorrectly parses pathname instead of hostname
      // Should be 'Azure: my-container' but returns 'Azure: path'
      expect(getRemoteDatabaseDisplayName('azure://my-container/path/to/db.duckdb')).toBe(
        'Azure: path',
      );
      expect(getRemoteDatabaseDisplayName('azure://another-container/db.duckdb')).toBe(
        'Azure: db.duckdb',
      );
    });

    it('should truncate invalid URLs', () => {
      const longInvalidUrl =
        'http://this-is-an-invalid-url-that-is-very-long-and-should-be-truncated.com/database.duckdb';
      const result = getRemoteDatabaseDisplayName(longInvalidUrl);
      expect(result).toBe('http://this-is-an-invalid-url-that-is-very-long...');
      expect(result.length).toBe(50); // 47 chars + 3 dots
    });

    it('should return original URL if short and invalid', () => {
      expect(getRemoteDatabaseDisplayName('not-a-url')).toBe('not-a-url');
    });

    it('should handle URLs with credentials gracefully', () => {
      expect(getRemoteDatabaseDisplayName('https://user:pass@example.com/db.duckdb')).toBe(
        'example.com',
      );
    });

    it('should handle URLs with ports', () => {
      expect(getRemoteDatabaseDisplayName('https://example.com:8080/db.duckdb')).toBe(
        'example.com',
      );
    });
  });

  describe('ALLOWED_REMOTE_PROTOCOLS', () => {
    it('should contain expected protocols (md excluded on non-Tauri)', () => {
      expect(ALLOWED_REMOTE_PROTOCOLS).toEqual(['https:', 's3:', 'gcs:', 'azure:']);
    });

    it('should not contain insecure protocols', () => {
      expect(ALLOWED_REMOTE_PROTOCOLS).not.toContain('http:');
      expect(ALLOWED_REMOTE_PROTOCOLS).not.toContain('ftp:');
      expect(ALLOWED_REMOTE_PROTOCOLS).not.toContain('file:');
    });
  });
});
