import { isTauriEnvironment } from '@utils/browser';

import { getLogger } from './debug-logger';
import { DuckDBWasmEngine } from './duckdb-wasm-engine';
import { DatabaseEngine, EngineConfig, EngineType } from './types';

const logger = getLogger('database:engine-factory');

export class DatabaseEngineFactory {
  private static engineCache = new Map<string, DatabaseEngine>();

  static async createEngine(config: EngineConfig): Promise<DatabaseEngine> {
    // Check if we have a cached engine for this config
    const cacheKey = this.getCacheKey(config);
    const cached = this.engineCache.get(cacheKey);

    // FIX: Clean up stale engines before creating new one
    if (cached) {
      if (cached.isReady()) {
        return cached; // Reuse ready engine
      }
      // Shutdown stale engine before replacing
      try {
        logger.debug('Shutting down stale engine', { cacheKey });
        await cached.shutdown();
      } catch (err) {
        logger.warn('Failed to shutdown stale engine', { error: err });
      }
      this.engineCache.delete(cacheKey);
    }

    let engine: DatabaseEngine;

    switch (config.type) {
      case 'duckdb-wasm':
        engine = new DuckDBWasmEngine();
        break;

      case 'duckdb-tauri':
        // Dynamically import Tauri engine when in Tauri environment
        if (isTauriEnvironment()) {
          logger.info('Creating Tauri DuckDB engine...');
          const { DuckDBTauriEngine } = await import('./duckdb-tauri-engine');
          engine = new DuckDBTauriEngine();
          logger.info('Tauri DuckDB engine created successfully');
        } else {
          throw new Error('Tauri DuckDB is only available in Tauri environment');
        }
        break;

      default:
        throw new Error(`Unknown engine type: ${config.type}`);
    }

    // Initialize the engine
    logger.debug('Initializing engine', { config });
    await engine.initialize(config);
    logger.info('Engine initialized successfully', { isReady: engine.isReady() });

    // Cache the engine
    this.engineCache.set(cacheKey, engine);

    return engine;
  }

  static detectOptimalEngine(): EngineConfig {
    // Detect the best engine based on the environment
    if (isTauriEnvironment()) {
      // Use native DuckDB through Tauri IPC
      return {
        type: 'duckdb-tauri',
        storageType: 'persistent',
        extensions: ['httpfs', 'gsheets', 'read_stat'],
      };
    }

    // Default to WASM for web environments
    return {
      type: 'duckdb-wasm',
      storageType: this.supportsOPFS() ? 'persistent' : 'memory',
      extensions: ['httpfs'],
    };
  }

  static isEngineAvailable(type: EngineType): boolean {
    switch (type) {
      case 'duckdb-wasm':
        return true; // Always available
      case 'duckdb-tauri':
        return isTauriEnvironment();
      default:
        return false;
    }
  }

  static async destroyEngine(config: EngineConfig): Promise<void> {
    const cacheKey = this.getCacheKey(config);
    const engine = this.engineCache.get(cacheKey);
    if (engine) {
      await engine.shutdown();
      this.engineCache.delete(cacheKey);
    }
  }

  static async destroyAllEngines(): Promise<void> {
    const shutdownPromises = Array.from(this.engineCache.values()).map((engine) =>
      engine.shutdown(),
    );
    await Promise.all(shutdownPromises);
    this.engineCache.clear();
  }

  private static getCacheKey(config: EngineConfig): string {
    // FIX: Include extensions and options in cache key to prevent config mismatch
    // Two configs differing only in extensions/options should not share cached engine
    const baseKey = `${config.type}-${config.storageType || 'memory'}-${config.storagePath || 'default'}`;

    // Hash extensions if present
    const extHash = config.extensions
      ? this.hashObject(config.extensions.sort()) // Sort for consistency
      : 'no-ext';

    // Hash options if present
    const optsHash = config.options ? this.hashObject(config.options) : 'no-opts';

    return `${baseKey}-${extHash}-${optsHash}`;
  }

  private static hashObject(obj: any): string {
    // Simple hash using JSON.stringify
    // For production, consider crypto.subtle.digest for better performance
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36); // Base 36 for shorter strings
  }

  private static supportsOPFS(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    );
  }
}
