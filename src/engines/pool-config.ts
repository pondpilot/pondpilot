export interface PoolConfig {
  /**
   * Minimum number of connections to maintain in the pool
   */
  minSize: number;

  /**
   * Maximum number of connections allowed in the pool
   */
  maxSize: number;

  /**
   * Maximum time to wait for a connection to become available (ms)
   */
  acquireTimeout: number;

  /**
   * Time after which idle connections are closed (ms)
   */
  idleTimeout: number;

  /**
   * Maximum number of clients that can wait for a connection
   */
  maxWaitingClients: number;

  /**
   * Whether to validate connections before use
   */
  validateOnAcquire?: boolean;

  /**
   * Time between connection validation checks (ms)
   */
  validationInterval?: number;
}

/**
 * Get optimal pool configuration based on engine type and environment
 */
export function getOptimalPoolConfig(engineType: string): PoolConfig {
  switch (engineType) {
    case 'duckdb-tauri':
      return {
        minSize: 2,
        maxSize: 10, // Lower for native due to resource usage
        acquireTimeout: 5000,
        idleTimeout: 30000,
        maxWaitingClients: 20,
        validateOnAcquire: true,
        validationInterval: 60000,
      };

    case 'duckdb-wasm':
      return {
        minSize: 5,
        maxSize: 30, // Higher for WASM as connections are lighter
        acquireTimeout: 3000,
        idleTimeout: 60000,
        maxWaitingClients: 50,
        validateOnAcquire: false,
        validationInterval: 120000,
      };

    default:
      // Conservative defaults
      return {
        minSize: 1,
        maxSize: 5,
        acquireTimeout: 10000,
        idleTimeout: 60000,
        maxWaitingClients: 10,
        validateOnAcquire: false,
      };
  }
}

/**
 * Get pool configuration based on performance mode
 */
export function getPoolConfigByMode(
  mode: 'balanced' | 'performance' | 'compatibility',
): Partial<PoolConfig> {
  switch (mode) {
    case 'performance':
      return {
        minSize: 10,
        maxSize: 50,
        acquireTimeout: 1000,
        idleTimeout: 120000,
        validateOnAcquire: false,
      };

    case 'compatibility':
      return {
        minSize: 1,
        maxSize: 5,
        acquireTimeout: 10000,
        idleTimeout: 30000,
        validateOnAcquire: true,
      };

    case 'balanced':
    default:
      return {
        minSize: 3,
        maxSize: 20,
        acquireTimeout: 5000,
        idleTimeout: 60000,
        validateOnAcquire: true,
      };
  }
}

/**
 * Merge pool configurations with user preferences
 */
export function mergePoolConfig(
  base: PoolConfig,
  ...overrides: Array<Partial<PoolConfig> | undefined>
): PoolConfig {
  const merged = { ...base };

  for (const override of overrides) {
    if (override) {
      Object.assign(merged, override);
    }
  }

  // Validate configuration
  if (merged.minSize > merged.maxSize) {
    merged.minSize = merged.maxSize;
  }

  if (merged.minSize < 0) {
    merged.minSize = 0;
  }

  if (merged.maxSize < 1) {
    merged.maxSize = 1;
  }

  return merged;
}

/**
 * Dynamic pool sizing based on system resources
 */
export function calculateDynamicPoolSize(): { min: number; max: number } {
  // In a browser environment, we can't directly check system resources
  // Use conservative defaults that can be adjusted based on usage patterns

  // Check if we're in a worker context
  const isWorker =
    typeof (globalThis as any).WorkerGlobalScope !== 'undefined' &&
    globalThis instanceof (globalThis as any).WorkerGlobalScope;

  // Check for available memory hints (if available)
  const memory = (navigator as any).deviceMemory;

  if (memory) {
    // Adjust pool size based on available memory
    if (memory >= 8) {
      return { min: 5, max: 50 };
    }
    if (memory >= 4) {
      return { min: 3, max: 30 };
    }
    if (memory >= 2) {
      return { min: 2, max: 20 };
    }
  }

  // Default conservative values
  return { min: 2, max: 15 };
}
