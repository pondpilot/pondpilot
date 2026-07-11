import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  normalizeRemoteUrl,
  shouldUseProxyFor,
  wrapWithCorsProxyPathBased,
  isRemoteUrl,
  isCloudStorageUrl,
  convertS3ToHttps,
  getS3EndpointFromSession,
  isValidS3Endpoint,
  CORS_PROXY_BEHAVIORS,
  PROXY_PREFIX,
  REMOTE_PROTOCOLS,
  S3_ENDPOINT_VARIABLE,
} from '@utils/cors-proxy-config';

describe('cors-proxy-config', () => {
  describe('isRemoteUrl', () => {
    it('should return true for http URLs', () => {
      expect(isRemoteUrl('http://example.com/data.csv')).toBe(true);
    });

    it('should return true for https URLs', () => {
      expect(isRemoteUrl('https://example.com/data.parquet')).toBe(true);
    });

    it('should return true for s3 URLs', () => {
      expect(isRemoteUrl('s3://bucket/data.parquet')).toBe(true);
    });

    it('should return true for gcs URLs', () => {
      expect(isRemoteUrl('gcs://bucket/data.parquet')).toBe(true);
    });

    it('should return true for azure URLs', () => {
      expect(isRemoteUrl('azure://container/data.parquet')).toBe(true);
    });

    it('should return false for local file paths', () => {
      expect(isRemoteUrl('/path/to/local/file.csv')).toBe(false);
    });

    it('should return false for relative paths', () => {
      expect(isRemoteUrl('./data/file.csv')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isRemoteUrl('not a url')).toBe(false);
    });

    it('should return false for file:// protocol', () => {
      expect(isRemoteUrl('file:///path/to/file.csv')).toBe(false);
    });
  });

  describe('isCloudStorageUrl', () => {
    describe('S3 URLs', () => {
      it('should return true for s3:// protocol URLs', () => {
        expect(isCloudStorageUrl('s3://bucket/path/to/file.parquet')).toBe(true);
      });

      it('should return true for bucket.s3.region.amazonaws.com', () => {
        expect(isCloudStorageUrl('https://mybucket.s3.us-east-1.amazonaws.com/data.csv')).toBe(
          true,
        );
      });

      it('should return true for bucket.s3.amazonaws.com (legacy)', () => {
        expect(isCloudStorageUrl('https://mybucket.s3.amazonaws.com/data.csv')).toBe(true);
      });

      it('should return true for s3.region.amazonaws.com/bucket', () => {
        expect(isCloudStorageUrl('https://s3.us-west-2.amazonaws.com/bucket/file.json')).toBe(true);
      });

      it('should return true for the actual pondpilot S3 URL', () => {
        expect(
          isCloudStorageUrl('https://pondpilot.s3.us-east-2.amazonaws.com/chinook.duckdb'),
        ).toBe(true);
      });

      it('should return true for http S3 URLs', () => {
        expect(isCloudStorageUrl('http://mybucket.s3.us-east-1.amazonaws.com/data.csv')).toBe(true);
      });
    });

    describe('GCS URLs', () => {
      it('should return true for gcs:// protocol URLs', () => {
        expect(isCloudStorageUrl('gcs://bucket/path/to/file.parquet')).toBe(true);
      });

      it('should return true for storage.googleapis.com', () => {
        expect(isCloudStorageUrl('https://storage.googleapis.com/bucket/data.csv')).toBe(true);
      });

      it('should return true for storage.cloud.google.com', () => {
        expect(isCloudStorageUrl('https://storage.cloud.google.com/bucket/data.csv')).toBe(true);
      });
    });

    describe('Azure Blob Storage URLs', () => {
      it('should return true for azure:// protocol URLs', () => {
        expect(isCloudStorageUrl('azure://container/path/to/file.parquet')).toBe(true);
      });

      it('should return true for accountname.blob.core.windows.net', () => {
        expect(
          isCloudStorageUrl('https://myaccount.blob.core.windows.net/container/data.csv'),
        ).toBe(true);
      });
    });

    describe('Non-cloud storage URLs', () => {
      it('should return false for regular http URLs', () => {
        expect(isCloudStorageUrl('http://example.com/data.csv')).toBe(false);
      });

      it('should return false for regular https URLs', () => {
        expect(isCloudStorageUrl('https://example.com/data.csv')).toBe(false);
      });

      it('should return false for local file paths', () => {
        expect(isCloudStorageUrl('/local/path/data.csv')).toBe(false);
      });

      it('should return false for invalid URLs', () => {
        expect(isCloudStorageUrl('not a url')).toBe(false);
      });

      it('should return false for URLs with "s3" in domain but not AWS', () => {
        expect(isCloudStorageUrl('https://s3-backup.example.com/data.csv')).toBe(false);
      });

      it('should return false for URLs with "storage" in domain but not GCS', () => {
        expect(isCloudStorageUrl('https://storage.example.com/data.csv')).toBe(false);
      });
    });
  });

  describe('normalizeRemoteUrl', () => {
    it('should strip proxy: prefix from URL', () => {
      const result = normalizeRemoteUrl('proxy:https://example.com/data.csv');
      expect(result.url).toBe('https://example.com/data.csv');
      expect(result.hadProxyPrefix).toBe(true);
      expect(result.isRemote).toBe(true);
    });

    it('should handle URL without proxy: prefix', () => {
      const result = normalizeRemoteUrl('https://example.com/data.csv');
      expect(result.url).toBe('https://example.com/data.csv');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(true);
    });

    it('should detect remote http URL', () => {
      const result = normalizeRemoteUrl('http://example.com/data.csv');
      expect(result.url).toBe('http://example.com/data.csv');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(true);
    });

    it('should detect s3 URLs as remote', () => {
      const result = normalizeRemoteUrl('s3://bucket/data.parquet');
      expect(result.url).toBe('s3://bucket/data.parquet');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(true);
    });

    it('should detect gcs URLs as remote', () => {
      const result = normalizeRemoteUrl('gcs://bucket/data.parquet');
      expect(result.url).toBe('gcs://bucket/data.parquet');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(true);
    });

    it('should detect azure URLs as remote', () => {
      const result = normalizeRemoteUrl('azure://container/data.parquet');
      expect(result.url).toBe('azure://container/data.parquet');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(true);
    });

    it('should handle proxy: prefix with http URL', () => {
      const result = normalizeRemoteUrl('proxy:http://example.com/data.csv');
      expect(result.url).toBe('http://example.com/data.csv');
      expect(result.hadProxyPrefix).toBe(true);
      expect(result.isRemote).toBe(true);
    });

    it('should handle proxy: prefix with s3 URL', () => {
      const result = normalizeRemoteUrl('proxy:s3://bucket/data.parquet');
      expect(result.url).toBe('s3://bucket/data.parquet');
      expect(result.hadProxyPrefix).toBe(true);
      expect(result.isRemote).toBe(true);
    });

    it('should handle local paths', () => {
      const result = normalizeRemoteUrl('/local/path/data.csv');
      expect(result.url).toBe('/local/path/data.csv');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(false);
    });

    it('should handle invalid URLs', () => {
      const result = normalizeRemoteUrl('not a url');
      expect(result.url).toBe('not a url');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(false);
    });

    it('should handle case-sensitive proxy prefix', () => {
      const result = normalizeRemoteUrl('PROXY:https://example.com/data.csv');
      expect(result.url).toBe('PROXY:https://example.com/data.csv');
      expect(result.hadProxyPrefix).toBe(false);
      expect(result.isRemote).toBe(false);
    });
  });

  describe('shouldUseProxyFor', () => {
    describe('with manual behavior', () => {
      const behavior = CORS_PROXY_BEHAVIORS.MANUAL;

      it('should use proxy when hadProxyPrefix is true for http URL', () => {
        const result = shouldUseProxyFor('http://example.com/data.csv', true, behavior);
        expect(result).toBe(true);
      });

      it('should use proxy when hadProxyPrefix is true for https URL', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', true, behavior);
        expect(result).toBe(true);
      });

      it('should not use proxy when hadProxyPrefix is false', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', false, behavior);
        expect(result).toBe(false);
      });

      it('should not use proxy for s3 even with prefix', () => {
        const result = shouldUseProxyFor('s3://bucket/data.parquet', true, behavior);
        expect(result).toBe(false);
      });

      it('should not use proxy for gcs even with prefix', () => {
        const result = shouldUseProxyFor('gcs://bucket/data.parquet', true, behavior);
        expect(result).toBe(false);
      });

      it('should not use proxy for azure even with prefix', () => {
        const result = shouldUseProxyFor('azure://container/data.parquet', true, behavior);
        expect(result).toBe(false);
      });

      it('should use proxy for S3 HTTPS URLs with prefix', () => {
        const result = shouldUseProxyFor(
          'https://mybucket.s3.us-east-1.amazonaws.com/data.csv',
          true,
          behavior,
        );
        expect(result).toBe(true);
      });

      it('should use proxy for GCS HTTPS URLs with prefix', () => {
        const result = shouldUseProxyFor(
          'https://storage.googleapis.com/bucket/data.csv',
          true,
          behavior,
        );
        expect(result).toBe(true);
      });

      it('should use proxy for Azure HTTPS URLs with prefix', () => {
        const result = shouldUseProxyFor(
          'https://myaccount.blob.core.windows.net/container/data.csv',
          true,
          behavior,
        );
        expect(result).toBe(true);
      });

      it('should not use proxy for local paths', () => {
        const result = shouldUseProxyFor('/local/path/data.csv', true, behavior);
        expect(result).toBe(false);
      });

      it('should ignore hadCorsError in manual mode', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', false, behavior, true);
        expect(result).toBe(false);
      });
    });

    describe('with auto behavior', () => {
      const behavior = CORS_PROXY_BEHAVIORS.AUTO;

      it('should use proxy when hadCorsError is true for http URL', () => {
        const result = shouldUseProxyFor('http://example.com/data.csv', false, behavior, true);
        expect(result).toBe(true);
      });

      it('should use proxy when hadCorsError is true for https URL', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', false, behavior, true);
        expect(result).toBe(true);
      });

      it('should not use proxy when hadCorsError is false', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', false, behavior, false);
        expect(result).toBe(false);
      });

      it('should not use proxy for s3 even with CORS error', () => {
        const result = shouldUseProxyFor('s3://bucket/data.parquet', false, behavior, true);
        expect(result).toBe(false);
      });

      it('should not use proxy for gcs even with CORS error', () => {
        const result = shouldUseProxyFor('gcs://bucket/data.parquet', false, behavior, true);
        expect(result).toBe(false);
      });

      it('should not use proxy for azure even with CORS error', () => {
        const result = shouldUseProxyFor('azure://container/data.parquet', false, behavior, true);
        expect(result).toBe(false);
      });

      it('should use proxy for S3 HTTPS URLs with CORS error', () => {
        const result = shouldUseProxyFor(
          'https://pondpilot.s3.us-east-2.amazonaws.com/chinook.duckdb',
          false,
          behavior,
          true,
        );
        expect(result).toBe(true);
      });

      it('should use proxy for GCS HTTPS URLs with CORS error', () => {
        const result = shouldUseProxyFor(
          'https://storage.googleapis.com/bucket/data.csv',
          false,
          behavior,
          true,
        );
        expect(result).toBe(true);
      });

      it('should use proxy for Azure HTTPS URLs with CORS error', () => {
        const result = shouldUseProxyFor(
          'https://myaccount.blob.core.windows.net/container/data.csv',
          false,
          behavior,
          true,
        );
        expect(result).toBe(true);
      });

      it('should not use proxy for local paths', () => {
        const result = shouldUseProxyFor('/local/path/data.csv', false, behavior, true);
        expect(result).toBe(false);
      });

      it('should ignore hadProxyPrefix in auto mode', () => {
        const result = shouldUseProxyFor('https://example.com/data.csv', true, behavior, false);
        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle invalid URLs gracefully', () => {
        const result = shouldUseProxyFor('not a url', true, CORS_PROXY_BEHAVIORS.MANUAL);
        expect(result).toBe(false);
      });

      it('should handle empty string URLs', () => {
        const result = shouldUseProxyFor('', true, CORS_PROXY_BEHAVIORS.MANUAL);
        expect(result).toBe(false);
      });
    });
  });

  describe('wrapWithCorsProxyPathBased', () => {
    beforeEach(() => {
      // Reset global mock environment before each test
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.VITE_CORS_PROXY_URL = undefined;
        (global as any).import.meta.env.DEV = false;
      }
    });

    it('should wrap URL with production proxy by default', () => {
      const result = wrapWithCorsProxyPathBased('https://example.com/data.csv');
      expect(result).toBe('https://cors-proxy.pondpilot.io/proxy-path/https/example.com/data.csv');
    });

    it('should wrap URL with dev proxy in development mode', () => {
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.DEV = true;
      }
      const result = wrapWithCorsProxyPathBased('https://example.com/data.csv');
      expect(result).toBe('http://localhost:3000/proxy-path/https/example.com/data.csv');
    });

    it('should use custom proxy URL from environment variable', () => {
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.VITE_CORS_PROXY_URL = 'https://custom-proxy.example.com';
      }
      const result = wrapWithCorsProxyPathBased('https://example.com/data.csv');
      expect(result).toBe('https://custom-proxy.example.com/proxy-path/https/example.com/data.csv');
    });

    it('should properly handle URL with query parameters', () => {
      const result = wrapWithCorsProxyPathBased('https://example.com/data?foo=bar&baz=qux');
      expect(result).toBe(
        'https://cors-proxy.pondpilot.io/proxy-path/https/example.com/data?foo=bar&baz=qux',
      );
    });

    it('should handle URL with spaces in path', () => {
      const result = wrapWithCorsProxyPathBased('https://example.com/my data.csv');
      expect(result).toBe(
        'https://cors-proxy.pondpilot.io/proxy-path/https/example.com/my%20data.csv',
      );
    });

    it('should strip hash fragment from URL', () => {
      const result = wrapWithCorsProxyPathBased('https://example.com/data.csv#section');
      expect(result).toBe('https://cors-proxy.pondpilot.io/proxy-path/https/example.com/data.csv');
    });

    it('should handle URL with authentication in hostname', () => {
      const result = wrapWithCorsProxyPathBased('https://user:pass@example.com/data.csv');
      expect(result).toBe('https://cors-proxy.pondpilot.io/proxy-path/https/example.com/data.csv');
    });

    it('should handle URL with port number', () => {
      const result = wrapWithCorsProxyPathBased('https://example.com:8080/data.csv');
      expect(result).toBe(
        'https://cors-proxy.pondpilot.io/proxy-path/https/example.com:8080/data.csv',
      );
    });

    it('should handle very long URLs', () => {
      const longPath = 'a'.repeat(1000);
      const result = wrapWithCorsProxyPathBased(`https://example.com/${longPath}/data.csv`);
      expect(result).toContain('/proxy-path/https/example.com/');
      expect(result.length).toBeGreaterThan(1000);
    });

    it('should handle HTTP (not HTTPS) URLs', () => {
      const result = wrapWithCorsProxyPathBased('http://example.com/data.csv');
      expect(result).toBe('https://cors-proxy.pondpilot.io/proxy-path/http/example.com/data.csv');
    });

    it('should handle S3 HTTPS URLs', () => {
      const result = wrapWithCorsProxyPathBased(
        'https://mybucket.s3.us-east-1.amazonaws.com/path/to/file.duckdb',
      );
      expect(result).toBe(
        'https://cors-proxy.pondpilot.io/proxy-path/https/mybucket.s3.us-east-1.amazonaws.com/path/to/file.duckdb',
      );
    });
  });

  describe('CORS_PROXY_BEHAVIORS constants', () => {
    it('should have AUTO behavior', () => {
      expect(CORS_PROXY_BEHAVIORS.AUTO).toBe('auto');
    });

    it('should have MANUAL behavior', () => {
      expect(CORS_PROXY_BEHAVIORS.MANUAL).toBe('manual');
    });

    it('should only have two behaviors', () => {
      expect(Object.keys(CORS_PROXY_BEHAVIORS)).toHaveLength(2);
    });
  });

  describe('PROXY_PREFIX constant', () => {
    it('should be "proxy:"', () => {
      expect(PROXY_PREFIX).toBe('proxy:');
    });
  });

  describe('REMOTE_PROTOCOLS constant', () => {
    it('should include all expected protocols', () => {
      expect(REMOTE_PROTOCOLS).toEqual(['http:', 'https:', 's3:', 'gcs:', 'azure:']);
    });

    it('should have exactly 5 protocols', () => {
      expect(REMOTE_PROTOCOLS).toHaveLength(5);
    });
  });

  describe('convertS3ToHttps', () => {
    it('should convert basic S3 URL to virtual-hosted-style HTTPS', () => {
      const result = convertS3ToHttps('s3://mybucket/path/to/file.duckdb');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/path/to/file.duckdb');
    });

    it('should handle S3 URL with dotted bucket name using path-style', () => {
      const result = convertS3ToHttps('s3://my.dotted.bucket/data.csv');
      expect(result).toBe('https://s3.amazonaws.com/my.dotted.bucket/data.csv');
    });

    it('should preserve query strings', () => {
      const result = convertS3ToHttps('s3://mybucket/file.csv?versionId=abc123');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv?versionId=abc123');
    });

    it('should preserve query strings with dotted buckets', () => {
      const result = convertS3ToHttps('s3://my.bucket/file.csv?versionId=xyz');
      expect(result).toBe('https://s3.amazonaws.com/my.bucket/file.csv?versionId=xyz');
    });

    it('should handle S3 URLs with no path', () => {
      const result = convertS3ToHttps('s3://mybucket/');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/');
    });

    it('should handle S3 URLs with complex paths', () => {
      const result = convertS3ToHttps('s3://mybucket/folder1/folder2/file.parquet');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/folder1/folder2/file.parquet');
    });

    it('should return null for non-S3 URLs', () => {
      expect(convertS3ToHttps('https://example.com/file.csv')).toBeNull();
      expect(convertS3ToHttps('gcs://bucket/file.csv')).toBeNull();
      expect(convertS3ToHttps('file:///local/file.csv')).toBeNull();
    });

    it('should return null for invalid URLs', () => {
      expect(convertS3ToHttps('not a url')).toBeNull();
      expect(convertS3ToHttps('')).toBeNull();
    });

    it('should return null for S3 URLs with missing bucket', () => {
      expect(convertS3ToHttps('s3://')).toBeNull();
      expect(convertS3ToHttps('s3:///path/to/file')).toBeNull();
    });

    it('should handle multiple query parameters', () => {
      const result = convertS3ToHttps('s3://mybucket/file.csv?key1=value1&key2=value2');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv?key1=value1&key2=value2');
    });

    it('should handle URL-encoded characters in path', () => {
      const result = convertS3ToHttps('s3://mybucket/path%20with%20spaces/file.csv');
      expect(result).toBe('https://mybucket.s3.amazonaws.com/path%20with%20spaces/file.csv');
    });

    it('should use path-style for bucket with single dot', () => {
      const result = convertS3ToHttps('s3://my.bucket/file.csv');
      expect(result).toBe('https://s3.amazonaws.com/my.bucket/file.csv');
    });

    it('should use path-style for bucket with multiple dots', () => {
      const result = convertS3ToHttps('s3://my.dotted.bucket.name/file.csv');
      expect(result).toBe('https://s3.amazonaws.com/my.dotted.bucket.name/file.csv');
    });

    it('should use virtual-hosted-style for bucket without dots', () => {
      const result = convertS3ToHttps('s3://mybucket123/file.csv');
      expect(result).toBe('https://mybucket123.s3.amazonaws.com/file.csv');
    });

    describe('with custom S3 endpoint', () => {
      it('should use custom endpoint with path-style URL', () => {
        const result = convertS3ToHttps(
          's3://mybucket/path/to/file.duckdb',
          'minio.example.com:9000',
        );
        expect(result).toBe('https://minio.example.com:9000/mybucket/path/to/file.duckdb');
      });

      it('should use custom endpoint for dotted bucket names', () => {
        const result = convertS3ToHttps('s3://my.dotted.bucket/data.csv', 'storage.example.com');
        expect(result).toBe('https://storage.example.com/my.dotted.bucket/data.csv');
      });

      it('should preserve query strings with custom endpoint', () => {
        const result = convertS3ToHttps(
          's3://mybucket/file.csv?versionId=abc123',
          'minio.example.com:9000',
        );
        expect(result).toBe('https://minio.example.com:9000/mybucket/file.csv?versionId=abc123');
      });

      it('should use http for localhost endpoints', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 'localhost:9000');
        expect(result).toBe('http://localhost:9000/mybucket/file.csv');
      });

      it('should use http for 127.0.0.1 endpoints', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', '127.0.0.1:9000');
        expect(result).toBe('http://127.0.0.1:9000/mybucket/file.csv');
      });

      it('should respect explicit http:// protocol in endpoint', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 'http://minio.example.com:9000');
        expect(result).toBe('http://minio.example.com:9000/mybucket/file.csv');
      });

      it('should respect explicit https:// protocol in endpoint', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 'https://minio.example.com:9000');
        expect(result).toBe('https://minio.example.com:9000/mybucket/file.csv');
      });

      it('should handle endpoint with port number', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', '192.168.1.100:9000');
        expect(result).toBe('https://192.168.1.100:9000/mybucket/file.csv');
      });

      it('should handle endpoint without port', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 's3.digitaloceanspaces.com');
        expect(result).toBe('https://s3.digitaloceanspaces.com/mybucket/file.csv');
      });

      it('should handle complex paths with custom endpoint', () => {
        const result = convertS3ToHttps(
          's3://mybucket/folder1/folder2/file.parquet',
          'minio.example.com',
        );
        expect(result).toBe('https://minio.example.com/mybucket/folder1/folder2/file.parquet');
      });

      it('should handle bucket with root path and custom endpoint', () => {
        const result = convertS3ToHttps('s3://mybucket/', 'minio.example.com:9000');
        expect(result).toBe('https://minio.example.com:9000/mybucket/');
      });

      it('should fall back to AWS when endpoint is undefined', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', undefined);
        expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv');
      });

      it('should fall back to AWS when endpoint is empty string', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', '');
        expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv');
      });

      it('should fall back to AWS when endpoint contains injection characters', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 'user:pass@malicious.com');
        expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv');
      });

      it('should fall back to AWS when endpoint contains # character', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', 'example.com#fragment');
        expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv');
      });

      it('should use http for [::1] IPv6 localhost endpoint', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', '[::1]:9000');
        expect(result).toBe('http://[::1]:9000/mybucket/file.csv');
      });

      it('should fall back to AWS for bare ::1 (invalid URL format without brackets)', () => {
        const result = convertS3ToHttps('s3://mybucket/file.csv', '::1');
        expect(result).toBe('https://mybucket.s3.amazonaws.com/file.csv');
      });
    });
  });

  describe('isValidS3Endpoint', () => {
    describe('valid endpoints', () => {
      it('should return true for valid hostname', () => {
        expect(isValidS3Endpoint('minio.example.com')).toBe(true);
      });

      it('should return true for hostname with port', () => {
        expect(isValidS3Endpoint('minio.example.com:9000')).toBe(true);
      });

      it('should return true for IP address', () => {
        expect(isValidS3Endpoint('192.168.1.100')).toBe(true);
      });

      it('should return true for IP with port', () => {
        expect(isValidS3Endpoint('192.168.1.100:9000')).toBe(true);
      });

      it('should return true for localhost', () => {
        expect(isValidS3Endpoint('localhost')).toBe(true);
      });

      it('should return true for localhost with port', () => {
        expect(isValidS3Endpoint('localhost:9000')).toBe(true);
      });

      it('should return true for http:// URL', () => {
        expect(isValidS3Endpoint('http://minio.example.com:9000')).toBe(true);
      });

      it('should return true for https:// URL', () => {
        expect(isValidS3Endpoint('https://minio.example.com')).toBe(true);
      });

      it('should trim whitespace', () => {
        expect(isValidS3Endpoint('  minio.example.com  ')).toBe(true);
      });
    });

    describe('invalid endpoints', () => {
      it('should return false for empty string', () => {
        expect(isValidS3Endpoint('')).toBe(false);
      });

      it('should return false for whitespace only', () => {
        expect(isValidS3Endpoint('   ')).toBe(false);
      });

      it('should return false for endpoint with @ character', () => {
        expect(isValidS3Endpoint('user:pass@minio.example.com')).toBe(false);
      });

      it('should return false for endpoint with # character', () => {
        expect(isValidS3Endpoint('minio.example.com#fragment')).toBe(false);
      });

      it('should return false for URL with credentials', () => {
        expect(isValidS3Endpoint('http://user:pass@minio.example.com')).toBe(false);
      });

      it('should return false for invalid URL format', () => {
        expect(isValidS3Endpoint('not a valid endpoint!')).toBe(false);
      });
    });
  });

  describe('getS3EndpointFromSession', () => {
    it('should return endpoint when variable is set', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => 'minio.example.com:9000',
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBe('minio.example.com:9000');
    });

    it('should return null when variable returns null', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => null,
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when variable returns undefined', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => undefined,
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when getChildAt returns null', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => null,
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when value is string "null"', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => 'null',
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when value is string "undefined"', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => 'undefined',
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when value is empty string', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => '',
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should return null when query throws', async () => {
      const mockQueryFn = async () => {
        throw new Error('Query failed');
      };
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBeNull();
    });

    it('should convert non-string values to string', async () => {
      const mockQueryFn = async () => ({
        getChildAt: () => ({
          get: () => ({ toString: () => 'custom.endpoint.com' }),
        }),
      });
      const result = await getS3EndpointFromSession(mockQueryFn);
      expect(result).toBe('custom.endpoint.com');
    });

    it('should use correct SQL variable name', async () => {
      let capturedSql = '';
      const mockQueryFn = async (sql: string) => {
        capturedSql = sql;
        return {
          getChildAt: () => ({
            get: () => 'test.endpoint.com',
          }),
        };
      };
      await getS3EndpointFromSession(mockQueryFn);
      expect(capturedSql).toBe(`SELECT getvariable('${S3_ENDPOINT_VARIABLE}')`);
    });
  });
});
