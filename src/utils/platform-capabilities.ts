/**
 * Platform Capability Detection
 *
 * Utilities for detecting platform capabilities and determining what features
 * are available in the current environment (WASM vs Tauri)
 */

import { EngineType, EngineCapabilities } from '@engines/types';
import { RemoteConnectionType } from '@models/data-source';

/**
 * Current platform context
 */
export interface PlatformContext {
  /** Current engine type */
  engineType: EngineType;

  /** Platform capabilities */
  capabilities: EngineCapabilities;

  /** Whether we're running in Tauri */
  isTauri: boolean;

  /** Whether we're running in a browser */
  isBrowser: boolean;
}

/**
 * Connection capability information
 */
export interface ConnectionCapability {
  /** Whether this connection type is supported */
  supported: boolean;

  /** Human-readable reason if not supported */
  reason?: string;

  /** Alternative suggestions */
  alternatives?: string[];

  /** Requirements or limitations */
  requirements?: string[];
}

/**
 * Get current platform context
 */
export function getPlatformContext(): PlatformContext {
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
  const isBrowser = typeof window !== 'undefined' && !isTauri;

  // Default to WASM if we can't determine, but this should ideally come from the engine
  const engineType: EngineType = isTauri ? 'duckdb-tauri' : 'duckdb-wasm';

  // Basic capabilities - these should ideally come from the actual engine instance
  const capabilities: EngineCapabilities = {
    supportsStreaming: true,
    supportsMultiThreading: isTauri || (isBrowser && window.crossOriginIsolated === true),
    supportsDirectFileAccess: isTauri || (isBrowser && 'showOpenFilePicker' in window),
    supportsExtensions: true,
    supportsPersistence: true,
    supportsRemoteFiles: true,
    maxFileSize: isBrowser ? 2 * 1024 * 1024 * 1024 : undefined, // 2GB browser limit
    supportedFileFormats: isTauri ? ['all'] : ['csv', 'parquet', 'json', 'xlsx'],
    supportedExtensions: isTauri ? ['all'] : ['httpfs', 'postgres_scanner'],
  };

  return {
    engineType,
    capabilities,
    isTauri,
    isBrowser,
  };
}

/**
 * Check if a connection type is supported on the current platform
 */
export function getConnectionCapability(
  connectionType: RemoteConnectionType,
  context?: PlatformContext,
): ConnectionCapability {
  const platformContext = context || getPlatformContext();

  switch (connectionType) {
    case 'url':
    case 'http':
      return {
        supported: true,
        requirements: platformContext.isBrowser
          ? ['Requires HTTPS for secure connections', 'May require CORS headers from server']
          : ['Server must be accessible from this machine'],
      };

    case 'motherduck':
      return {
        supported: true,
        requirements: [
          'Requires MotherDuck token/credentials',
          "Uses DuckDB's MotherDuck extension",
        ],
      };

    case 's3':
      return {
        supported: true,
        requirements: platformContext.isBrowser
          ? [
              'Requires proper CORS configuration',
              'May require public read access or presigned URLs',
            ]
          : ['Requires valid AWS credentials or bucket permissions'],
      };

    case 'postgres':
      if (platformContext.isBrowser) {
        return {
          supported: false,
          reason: 'Browser security prevents direct database connections',
          alternatives: [
            'Use the desktop app for full PostgreSQL support',
            'Set up a REST API or GraphQL endpoint as a proxy',
            'Use a cloud database service with HTTP API',
          ],
        };
      }
      return {
        supported: true,
        requirements: [
          'Requires PostgreSQL server accessible from this machine',
          "Uses DuckDB's postgres_scanner extension",
          'Requires valid database credentials',
        ],
      };

    case 'mysql':
      if (platformContext.isBrowser) {
        return {
          supported: false,
          reason: 'Browser security prevents direct database connections',
          alternatives: [
            'Use the desktop app for full MySQL support',
            'Set up a REST API or GraphQL endpoint as a proxy',
            'Use a cloud database service with HTTP API',
          ],
        };
      }
      return {
        supported: true,
        requirements: [
          'Requires MySQL server accessible from this machine',
          "Uses DuckDB's mysql_scanner extension",
          'Requires valid database credentials',
        ],
      };

    default:
      return {
        supported: false,
        reason: `Unknown connection type: ${connectionType}`,
      };
  }
}

/**
 * Get all supported connection types for the current platform
 */
export function getSupportedConnectionTypes(context?: PlatformContext): RemoteConnectionType[] {
  const platformContext = context || getPlatformContext();
  const allTypes: RemoteConnectionType[] = ['url', 'http', 'motherduck', 's3', 'postgres', 'mysql'];

  return allTypes.filter((type) => getConnectionCapability(type, platformContext).supported);
}

/**
 * Get unsupported connection types with reasons
 */
export function getUnsupportedConnectionTypes(
  context?: PlatformContext,
): Array<{ type: RemoteConnectionType; capability: ConnectionCapability }> {
  const platformContext = context || getPlatformContext();
  const allTypes: RemoteConnectionType[] = ['url', 'http', 'motherduck', 's3', 'postgres', 'mysql'];

  return allTypes
    .map((type) => ({ type, capability: getConnectionCapability(type, platformContext) }))
    .filter(({ capability }) => !capability.supported);
}

/**
 * Check if the current platform supports a minimum set of features
 */
export function checkMinimumCapabilities(requirements: {
  directFileAccess?: boolean;
  remoteFiles?: boolean;
  extensions?: boolean;
  persistence?: boolean;
}): { supported: boolean; missingFeatures: string[] } {
  const context = getPlatformContext();
  const missing: string[] = [];

  if (requirements.directFileAccess && !context.capabilities.supportsDirectFileAccess) {
    missing.push('Direct file access');
  }

  if (requirements.remoteFiles && !context.capabilities.supportsRemoteFiles) {
    missing.push('Remote file access');
  }

  if (requirements.extensions && !context.capabilities.supportsExtensions) {
    missing.push('Extension support');
  }

  if (requirements.persistence && !context.capabilities.supportsPersistence) {
    missing.push('Data persistence');
  }

  return {
    supported: missing.length === 0,
    missingFeatures: missing,
  };
}

/**
 * Generate user-friendly platform information for debugging/support
 */
export function getPlatformInfo(): Record<string, any> {
  const context = getPlatformContext();

  return {
    platform: context.isTauri ? 'Desktop (Tauri)' : 'Browser (WASM)',
    engineType: context.engineType,
    capabilities: {
      streaming: context.capabilities.supportsStreaming,
      multiThreading: context.capabilities.supportsMultiThreading,
      directFileAccess: context.capabilities.supportsDirectFileAccess,
      extensions: context.capabilities.supportsExtensions,
      persistence: context.capabilities.supportsPersistence,
      remoteFiles: context.capabilities.supportsRemoteFiles,
    },
    supportedConnections: getSupportedConnectionTypes(context),
    unsupportedConnections: getUnsupportedConnectionTypes(context).map(({ type }) => type),
    browserFeatures: context.isBrowser
      ? {
          crossOriginIsolated: window.crossOriginIsolated,
          showOpenFilePicker: 'showOpenFilePicker' in window,
          userAgent: navigator.userAgent,
        }
      : null,
  };
}
