import { useRef, useCallback } from 'react';

/**
 * Use this hook to create a Promise that rejects when `abort` is called.
 * This is useful for cancelling async operations, such as fetch requests.
 *
 * @returns { getAbortPromise: () => Promise<never>; abort: (reason?: unknown) => void; }
 */
export const useAbortController = (): {
  /**
   * Get the current abort signal. This signal will be triggered when the
   * `abort` function is called.
   *
   * @returns {AbortSignal} The current abort signal.
   */
  getSignal: () => AbortSignal;

  /**
   * Abort the current signal and reject the promise returned by `getAbortPromise`.
   * This will also reset the abort controller for the next time.
   *
   * If no abort signal is active, this is no-op.
   *
   * @param reason - Optional reason for the abort. This will be passed to the abort signal.
   */
  abort: (reason?: unknown) => void;
} => {
  const abortControllerRef = useRef<AbortController | null>(null);

  const getAbortController = useCallback(() => {
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }
    return abortControllerRef.current;
  }, []);

  const abortSignal = useCallback((reason?: unknown) => {
    // if we don't have a current abort controller, then we don't have a current signal either...
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(reason);
      abortControllerRef.current = null; // Resets it for next time
    }
  }, []);

  const getSignal = useCallback(() => getAbortController().signal, [getAbortController]);

  return { getSignal, abort: abortSignal };
};
