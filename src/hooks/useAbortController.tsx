import { useRef, useCallback } from 'react';

export const useAbortController = () => {
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

  return { getSignal, abortSignal };
};
