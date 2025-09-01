import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getPlatformContext,
  getConnectionCapability,
  getSupportedConnectionTypes,
  getUnsupportedConnectionTypes,
  checkMinimumCapabilities,
  getPlatformInfo,
} from '@utils/platform-capabilities';

// Mock window object
const originalWindow = global.window;

describe('Platform Capabilities', () => {
  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
  });

  describe('getPlatformContext', () => {
    it('should detect Tauri environment', () => {
      // Mock Tauri environment
      (global as any).window = {
        __TAURI__: {},
      };

      const context = getPlatformContext();
      expect(context.isTauri).toBe(true);
      expect(context.isBrowser).toBe(false);
      expect(context.engineType).toBe('duckdb-tauri');
    });

    it('should detect browser environment', () => {
      // Mock browser environment without Tauri
      (global as any).window = {
        crossOriginIsolated: false,
      };

      const context = getPlatformContext();
      expect(context.isTauri).toBe(false);
      expect(context.isBrowser).toBe(true);
      expect(context.engineType).toBe('duckdb-wasm');
    });

    it('should detect cross-origin isolation in browser', () => {
      (global as any).window = {
        crossOriginIsolated: true,
      };

      const context = getPlatformContext();
      expect(context.capabilities.supportsMultiThreading).toBe(true);
    });

    it('should set appropriate file size limits', () => {
      // Test browser limits
      (global as any).window = {};
      const browserContext = getPlatformContext();
      expect(browserContext.capabilities.maxFileSize).toBe(2 * 1024 * 1024 * 1024);

      // Test Tauri (no limits)
      (global as any).window = { __TAURI__: {} };
      const tauriContext = getPlatformContext();
      expect(tauriContext.capabilities.maxFileSize).toBeUndefined();
    });
  });

  describe('getConnectionCapability', () => {
    it('should support URL connections on all platforms', () => {
      const capability = getConnectionCapability('url');
      expect(capability.supported).toBe(true);
      expect(capability.requirements).toBeDefined();
    });

    it('should support MotherDuck connections on all platforms', () => {
      const capability = getConnectionCapability('motherduck');
      expect(capability.supported).toBe(true);
      expect(capability.requirements).toContain('Requires MotherDuck token/credentials');
    });

    it('should not support PostgreSQL in browser', () => {
      (global as any).window = {};
      const capability = getConnectionCapability('postgres');

      expect(capability.supported).toBe(false);
      expect(capability.reason).toContain('Browser security prevents direct database connections');
      expect(capability.alternatives).toBeDefined();
      expect(capability.alternatives?.length).toBeGreaterThan(0);
    });

    it('should support PostgreSQL in Tauri', () => {
      (global as any).window = { __TAURI__: {} };
      const capability = getConnectionCapability('postgres');

      expect(capability.supported).toBe(true);
      expect(capability.requirements).toContain("Uses DuckDB's postgres_scanner extension");
    });

    it('should not support MySQL in browser', () => {
      (global as any).window = {};
      const capability = getConnectionCapability('mysql');

      expect(capability.supported).toBe(false);
      expect(capability.reason).toContain('Browser security prevents direct database connections');
    });

    it('should support MySQL in Tauri', () => {
      (global as any).window = { __TAURI__: {} };
      const capability = getConnectionCapability('mysql');

      expect(capability.supported).toBe(true);
      expect(capability.requirements).toContain("Uses DuckDB's mysql_scanner extension");
    });

    it('should provide S3 requirements for browser vs desktop', () => {
      // Browser requirements
      (global as any).window = {};
      const browserCapability = getConnectionCapability('s3');
      expect(browserCapability.requirements).toContain('Requires proper CORS configuration');

      // Tauri requirements
      (global as any).window = { __TAURI__: {} };
      const tauriCapability = getConnectionCapability('s3');
      expect(tauriCapability.requirements).toContain('Requires valid AWS credentials');
    });
  });

  describe('getSupportedConnectionTypes', () => {
    it('should return limited types for browser', () => {
      (global as any).window = {};
      const supported = getSupportedConnectionTypes();

      expect(supported).toContain('url');
      expect(supported).toContain('http');
      expect(supported).toContain('motherduck');
      expect(supported).toContain('s3');
      expect(supported).not.toContain('postgres');
      expect(supported).not.toContain('mysql');
    });

    it('should return all types for Tauri', () => {
      (global as any).window = { __TAURI__: {} };
      const supported = getSupportedConnectionTypes();

      expect(supported).toContain('url');
      expect(supported).toContain('http');
      expect(supported).toContain('motherduck');
      expect(supported).toContain('s3');
      expect(supported).toContain('postgres');
      expect(supported).toContain('mysql');
    });
  });

  describe('getUnsupportedConnectionTypes', () => {
    it('should return PostgreSQL and MySQL as unsupported in browser', () => {
      (global as any).window = {};
      const unsupported = getUnsupportedConnectionTypes();

      const unsupportedTypes = unsupported.map((u) => u.type);
      expect(unsupportedTypes).toContain('postgres');
      expect(unsupportedTypes).toContain('mysql');
    });

    it('should return no unsupported types for Tauri', () => {
      (global as any).window = { __TAURI__: {} };
      const unsupported = getUnsupportedConnectionTypes();

      expect(unsupported).toHaveLength(0);
    });
  });

  describe('checkMinimumCapabilities', () => {
    it('should check direct file access requirement', () => {
      // Mock without file access
      (global as any).window = {};
      const result = checkMinimumCapabilities({ directFileAccess: true });

      expect(result.supported).toBe(false);
      expect(result.missingFeatures).toContain('Direct file access');
    });

    it('should check all capabilities', () => {
      (global as any).window = { __TAURI__: {} };
      const result = checkMinimumCapabilities({
        directFileAccess: true,
        remoteFiles: true,
        extensions: true,
        persistence: true,
      });

      expect(result.supported).toBe(true);
      expect(result.missingFeatures).toHaveLength(0);
    });
  });

  describe('getPlatformInfo', () => {
    it('should provide comprehensive platform information', () => {
      (global as any).window = {
        __TAURI__: {},
      };

      const info = getPlatformInfo();

      expect(info.platform).toBe('Desktop (Tauri)');
      expect(info.engineType).toBe('duckdb-tauri');
      expect(info.capabilities).toBeDefined();
      expect(info.supportedConnections).toBeDefined();
      expect(info.unsupportedConnections).toBeDefined();
      expect(info.browserFeatures).toBeNull(); // Should be null for Tauri
    });

    it('should provide browser-specific information', () => {
      (global as any).window = {
        crossOriginIsolated: true,
        navigator: {
          userAgent: 'Mozilla/5.0 Test Browser',
        },
      };
      global.navigator = (global as any).window.navigator;

      const info = getPlatformInfo();

      expect(info.platform).toBe('Browser (WASM)');
      expect(info.engineType).toBe('duckdb-wasm');
      expect(info.browserFeatures).toBeDefined();
      expect(info.browserFeatures?.crossOriginIsolated).toBe(true);
      expect(info.browserFeatures?.userAgent).toContain('Test Browser');
    });
  });
});
