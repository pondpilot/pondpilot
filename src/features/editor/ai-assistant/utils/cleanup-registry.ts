/**
 * Centralized cleanup registry for managing resource disposal in AI Assistant
 *
 * This utility provides a consistent pattern for registering and executing cleanup
 * operations across the AI Assistant feature, ensuring proper resource disposal
 * and preventing memory leaks.
 */

export type CleanupFunction = () => void;

export interface CleanupRegistry {
  /** Register a cleanup function to be called on dispose */
  register: (cleanup: CleanupFunction) => void;

  /** Register an event listener and automatically handle its removal */
  addEventListener: <K extends keyof HTMLElementEventMap>(
    element: HTMLElement | Document | Window,
    event: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) => void;

  /** Register a timeout and automatically handle its clearing */
  setTimeout: (callback: () => void, delay: number) => number;

  /** Register an interval and automatically handle its clearing */
  setInterval: (callback: () => void, delay: number) => number;

  /** Register a MutationObserver and automatically handle its disconnection */
  observeMutations: (
    target: Node,
    callback: MutationCallback,
    options?: MutationObserverInit,
  ) => MutationObserver;

  /** Execute all registered cleanup functions and clear the registry */
  dispose: () => void;

  /** Check if the registry has been disposed */
  isDisposed: () => boolean;
}

/**
 * Creates a new cleanup registry instance
 */
export function createCleanupRegistry(): CleanupRegistry {
  const cleanupFunctions: CleanupFunction[] = [];
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const observers = new Set<MutationObserver>();
  let disposed = false;

  const ensureNotDisposed = () => {
    if (disposed) {
      throw new Error('CleanupRegistry has already been disposed');
    }
  };

  return {
    register(cleanup: CleanupFunction): void {
      ensureNotDisposed();
      cleanupFunctions.push(cleanup);
    },

    addEventListener<K extends keyof HTMLElementEventMap>(
      element: HTMLElement | Document | Window,
      event: K,
      handler: (ev: HTMLElementEventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): void {
      ensureNotDisposed();
      element.addEventListener(event, handler as EventListener, options);
      this.register(() => {
        element.removeEventListener(event, handler as EventListener, options);
      });
    },

    setTimeout(callback: () => void, delay: number): number {
      ensureNotDisposed();
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        callback();
      }, delay);
      timeouts.add(id);
      return id;
    },

    setInterval(callback: () => void, delay: number): number {
      ensureNotDisposed();
      const id = window.setInterval(callback, delay);
      intervals.add(id);
      return id;
    },

    observeMutations(
      target: Node,
      callback: MutationCallback,
      options?: MutationObserverInit,
    ): MutationObserver {
      ensureNotDisposed();
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      observers.add(observer);
      return observer;
    },

    dispose(): void {
      if (disposed) return;

      // Clear all timeouts
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();

      // Clear all intervals
      intervals.forEach((id) => window.clearInterval(id));
      intervals.clear();

      // Disconnect all observers
      observers.forEach((observer) => observer.disconnect());
      observers.clear();

      // Execute all cleanup functions in reverse order (LIFO)
      for (let i = cleanupFunctions.length - 1; i >= 0; i -= 1) {
        try {
          cleanupFunctions[i]();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
      cleanupFunctions.length = 0;

      disposed = true;
    },

    isDisposed(): boolean {
      return disposed;
    },
  };
}

/**
 * Combines multiple cleanup registries into a single disposable unit
 */
export function combineCleanupRegistries(...registries: CleanupRegistry[]): CleanupRegistry {
  const combined = createCleanupRegistry();

  // Register all sub-registries for disposal
  registries.forEach((registry) => {
    combined.register(() => registry.dispose());
  });

  return combined;
}
