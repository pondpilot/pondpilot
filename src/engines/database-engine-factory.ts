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
    if (cached && cached.isReady()) {
      return cached;
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
        extensions: ['httpfs', 'gsheets'],
      };
    }

    // Default to WASM for web environments
    return {
      type: 'duckdb-wasm',
      storageType: this.supportsOPFS() ? 'persistent' : 'memory',
      extensions: ['httpfs', 'gsheets'],
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
    return `${config.type}-${config.storageType || 'memory'}-${config.storagePath || 'default'}`;
  }

  private static supportsOPFS(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    );
  }
}
