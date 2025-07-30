import { DuckDBWasmEngine } from './duckdb-wasm-engine';
import { DatabaseEngine, EngineConfig } from './types';

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

      case 'duckdb-native':
        // Dynamically import native engine when in Electron environment
        if (this.isElectronEnvironment()) {
          const { DuckDBNativeEngine } = await import('./duckdb-native-engine');
          engine = new DuckDBNativeEngine();
        } else {
          throw new Error('Native DuckDB is only available in Electron environment');
        }
        break;

      case 'duckdb-tauri':
        // Dynamically import Tauri engine when in Tauri environment
        if (this.isTauriEnvironment()) {
          const { DuckDBTauriEngine } = await import('./duckdb-tauri-engine');
          engine = new DuckDBTauriEngine();
        } else {
          throw new Error('Tauri DuckDB is only available in Tauri environment');
        }
        break;

      case 'sqlite':
        throw new Error('SQLite engine not yet implemented');

      default:
        throw new Error(`Unknown engine type: ${config.type}`);
    }

    // Initialize the engine
    await engine.initialize(config);

    // Cache the engine
    this.engineCache.set(cacheKey, engine);

    return engine;
  }

  static detectOptimalEngine(): EngineConfig {
    // Detect the best engine based on the environment
    if (this.isTauriEnvironment()) {
      return {
        type: 'duckdb-tauri',
        storageType: 'persistent',
        extensions: ['httpfs', 'postgres_scanner'],
      };
    }

    if (this.isElectronEnvironment()) {
      return {
        type: 'duckdb-native',
        storageType: 'persistent',
        extensions: ['httpfs', 'postgres_scanner'],
      };
    }

    // Default to WASM for web environments
    return {
      type: 'duckdb-wasm',
      storageType: this.supportsOPFS() ? 'persistent' : 'memory',
      extensions: ['httpfs'],
    };
  }

  static isEngineAvailable(type: string): boolean {
    switch (type) {
      case 'duckdb-wasm':
        return true; // Always available
      case 'duckdb-native':
        return this.isElectronEnvironment();
      case 'duckdb-tauri':
        return this.isTauriEnvironment();
      case 'sqlite':
        return false; // Not yet implemented
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

  private static isElectronEnvironment(): boolean {
    return (
      typeof window !== 'undefined' &&
      (window as any).process &&
      (window as any).process.type === 'renderer'
    );
  }

  private static isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && '__TAURI__' in window;
  }

  private static supportsOPFS(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    );
  }
}
