import { HashBucketAlgorithm } from './hash-bucket-algorithm';
import { JoinAlgorithm } from './join-algorithm';
import { SamplingAlgorithm } from './sampling-algorithm';
import { AlgorithmContext, AlgorithmSelectionMode, ComparisonAlgorithm } from './types';

/**
 * Registry of all available comparison algorithms
 */
class AlgorithmRegistry {
  private algorithms: Map<string, ComparisonAlgorithm> = new Map();

  constructor() {
    // Register all built-in algorithms
    this.register(new HashBucketAlgorithm());
    this.register(new JoinAlgorithm());
    this.register(new SamplingAlgorithm());
  }

  /**
   * Register a comparison algorithm
   */
  register(algorithm: ComparisonAlgorithm): void {
    this.algorithms.set(algorithm.name, algorithm);
  }

  /**
   * Get a specific algorithm by name
   */
  get(name: string): ComparisonAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  /**
   * Get all registered algorithms
   */
  getAll(): ComparisonAlgorithm[] {
    return Array.from(this.algorithms.values());
  }

  /**
   * Select the best algorithm for the given context and selection mode
   */
  selectAlgorithm(
    mode: AlgorithmSelectionMode,
    context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>,
  ): ComparisonAlgorithm {
    // If not auto mode, try to get the specific algorithm
    if (mode !== 'auto') {
      const algorithm = this.get(mode);
      if (algorithm && algorithm.canHandle(context)) {
        return algorithm;
      }
      // Fallback to auto if requested algorithm not found or can't handle
      console.warn(
        `Algorithm '${mode}' not found or cannot handle context. Falling back to auto-selection.`,
      );
    }

    // Auto-select based on cost estimates
    const capable = this.getAll().filter((alg) => alg.canHandle(context));

    if (capable.length === 0) {
      throw new Error('No capable algorithm found for the given context');
    }

    // Sort by cost (lower is better) and return the best
    const sorted = capable.sort((a, b) => a.estimateCost(context) - b.estimateCost(context));

    const selected = sorted[0];
    return selected;
  }
}

/**
 * Singleton instance of the algorithm registry
 */
export const algorithmRegistry = new AlgorithmRegistry();

/**
 * Helper function to select an algorithm
 */
export function selectAlgorithm(
  mode: AlgorithmSelectionMode,
  context: Omit<AlgorithmContext, 'tableName' | 'abortSignal'>,
): ComparisonAlgorithm {
  return algorithmRegistry.selectAlgorithm(mode, context);
}

/**
 * Helper function to get all algorithms
 */
export function getAllAlgorithms(): ComparisonAlgorithm[] {
  return algorithmRegistry.getAll();
}
