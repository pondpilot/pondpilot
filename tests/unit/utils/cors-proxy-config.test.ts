import {
  normalizeRemoteUrl,
  shouldUseProxyFor,
  wrapWithCorsProxy,
  isRemoteUrl,
  CORS_PROXY_BEHAVIORS,
  PROXY_PREFIX,
  REMOTE_PROTOCOLS,
} from '@utils/cors-proxy-config';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

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

  describe('wrapWithCorsProxy', () => {
    beforeEach(() => {
      // Reset global mock environment before each test
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.VITE_CORS_PROXY_URL = undefined;
        (global as any).import.meta.env.DEV = false;
      }
    });

    it('should wrap URL with production proxy by default', () => {
      const result = wrapWithCorsProxy('https://example.com/data.csv');
      expect(result).toBe(
        'https://cors-proxy.pondpilot.io/proxy?url=https%3A%2F%2Fexample.com%2Fdata.csv',
      );
    });

    it('should wrap URL with dev proxy in development mode', () => {
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.DEV = true;
      }
      const result = wrapWithCorsProxy('https://example.com/data.csv');
      expect(result).toBe('http://localhost:3000/proxy?url=https%3A%2F%2Fexample.com%2Fdata.csv');
    });

    it('should use custom proxy URL from environment variable', () => {
      if (typeof global !== 'undefined' && (global as any).import?.meta?.env) {
        (global as any).import.meta.env.VITE_CORS_PROXY_URL = 'https://custom-proxy.example.com';
      }
      const result = wrapWithCorsProxy('https://example.com/data.csv');
      expect(result).toBe(
        'https://custom-proxy.example.com/proxy?url=https%3A%2F%2Fexample.com%2Fdata.csv',
      );
    });

    it('should properly encode URL with special characters', () => {
      const result = wrapWithCorsProxy('https://example.com/data?foo=bar&baz=qux');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fdata%3Ffoo%3Dbar%26baz%3Dqux');
    });

    it('should encode URL with spaces', () => {
      const result = wrapWithCorsProxy('https://example.com/my data.csv');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fmy%20data.csv');
    });

    it('should handle URL with hash fragment', () => {
      const result = wrapWithCorsProxy('https://example.com/data.csv#section');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fdata.csv%23section');
    });

    it('should handle URL with authentication', () => {
      const result = wrapWithCorsProxy('https://user:pass@example.com/data.csv');
      expect(result).toContain('url=https%3A%2F%2Fuser%3Apass%40example.com%2Fdata.csv');
    });

    it('should handle URL with port number', () => {
      const result = wrapWithCorsProxy('https://example.com:8080/data.csv');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%3A8080%2Fdata.csv');
    });

    it('should handle very long URLs', () => {
      const longPath = 'a'.repeat(1000);
      const result = wrapWithCorsProxy(`https://example.com/${longPath}/data.csv`);
      expect(result).toContain('proxy?url=');
      expect(result.length).toBeGreaterThan(1000);
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
});
