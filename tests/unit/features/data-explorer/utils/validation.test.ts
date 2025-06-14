import { describe, it, expect } from '@jest/globals';

import { validateRemoteDatabaseUrl } from '../../../../../src/utils/remote-database-validation';

describe('validateRemoteDatabaseUrl', () => {
  describe('valid protocols', () => {
    it('should accept HTTPS URLs', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept S3 URLs', () => {
      const result = validateRemoteDatabaseUrl('s3://my-bucket/path/to/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept GCS URLs', () => {
      const result = validateRemoteDatabaseUrl('gcs://my-bucket/path/to/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept Azure URLs', () => {
      const result = validateRemoteDatabaseUrl('azure://my-container/path/to/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid protocols', () => {
    it('should reject HTTP URLs', () => {
      const result = validateRemoteDatabaseUrl('http://example.com/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Protocol "http:" is not allowed. Allowed protocols: https:, s3:, gcs:, azure:',
      );
    });

    it('should reject file:// URLs', () => {
      const result = validateRemoteDatabaseUrl('file:///etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Local file paths are not allowed for remote databases');
    });

    it('should reject FTP URLs', () => {
      const result = validateRemoteDatabaseUrl('ftp://example.com/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Protocol "ftp:" is not allowed. Allowed protocols: https:, s3:, gcs:, azure:',
      );
    });

    it('should reject URLs without protocol', () => {
      const result = validateRemoteDatabaseUrl('example.com/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });
  });

  describe('local network blocking for HTTPS', () => {
    it('should reject localhost', () => {
      const result = validateRemoteDatabaseUrl('https://localhost/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private/local network addresses are not allowed');
    });

    it('should reject 127.0.0.1', () => {
      const result = validateRemoteDatabaseUrl('https://127.0.0.1/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private/local network addresses are not allowed');
    });

    it('should reject private IP ranges (10.x.x.x)', () => {
      const result = validateRemoteDatabaseUrl('https://10.0.0.1/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private/local network addresses are not allowed');
    });

    it('should reject private IP ranges (172.16-31.x.x)', () => {
      const result = validateRemoteDatabaseUrl('https://172.16.0.1/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private/local network addresses are not allowed');
    });

    it('should reject private IP ranges (192.168.x.x)', () => {
      const result = validateRemoteDatabaseUrl('https://192.168.1.1/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private/local network addresses are not allowed');
    });

    it('should allow cloud storage protocols to use any hostname', () => {
      // Cloud storage protocols don't use traditional hostnames
      const result1 = validateRemoteDatabaseUrl('s3://localhost/bucket/data.db');
      expect(result1.isValid).toBe(true);

      const result2 = validateRemoteDatabaseUrl('gcs://192.168.1.1/bucket/data.db');
      expect(result2.isValid).toBe(true);
    });
  });

  describe('path traversal protection', () => {
    it('should reject URLs with .. in path', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/../etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('URL contains invalid path characters');
    });

    it('should reject S3 URLs with .. in path', () => {
      const result = validateRemoteDatabaseUrl('s3://bucket/../other-bucket/data.db');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('URL contains invalid path characters');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = validateRemoteDatabaseUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('URL must be a non-empty string');
    });

    it('should handle whitespace-only string', () => {
      const result = validateRemoteDatabaseUrl('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('URL must be a non-empty string');
    });

    it('should handle malformed URLs gracefully', () => {
      const result = validateRemoteDatabaseUrl('https://[invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });

    it('should accept URLs with query parameters', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/data.db?token=abc123');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept URLs with fragments', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/data.db#section');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept URLs with credentials', () => {
      const result = validateRemoteDatabaseUrl('https://user:pass@example.com/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('URL normalization', () => {
    it('should trim whitespace', () => {
      const result = validateRemoteDatabaseUrl('  https://example.com/data.db  ');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle URLs with special characters in path', () => {
      const result = validateRemoteDatabaseUrl('https://example.com/path%20with%20spaces/data.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('cloud storage validation', () => {
    it('should reject S3 URLs without bucket and path', () => {
      const result = validateRemoteDatabaseUrl('s3://');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('S3 URLs must include a bucket and path');
    });

    it('should reject GCS URLs without bucket and path', () => {
      const result = validateRemoteDatabaseUrl('gcs://');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('GCS URLs must include a bucket and path');
    });

    it('should reject Azure URLs without container and path', () => {
      const result = validateRemoteDatabaseUrl('azure://');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Azure URLs must include a container and path');
    });

    it('should accept S3 URLs with bucket and path', () => {
      const result = validateRemoteDatabaseUrl('s3://bucket/path/file.db');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
