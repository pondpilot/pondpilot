import { useAbortController } from '@hooks/use-abort-controller';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook that manages async processing state and safety checks
 */
export function useAsyncProcessing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortController = useAbortController();
  const isMounted = useRef(true);
  const isProcessingRef = useRef(false);

  // Handle component unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortController.abort();
    };
  }, [abortController]);

  // Use refs for these to make them stable
  const safeSetLoading = useCallback((value: boolean) => {
    if (isMounted.current) setLoading(value);
  }, []);

  const safeSetError = useCallback((value: Error | null) => {
    if (isMounted.current) setError(value);
  }, []);

  const createProcessingSession = useCallback(() => {
    if (isProcessingRef.current) {
      return null; // Already processing
    }

    isProcessingRef.current = true;
    safeSetLoading(true);
    safeSetError(null);

    return {
      cleanup: () => {
        isProcessingRef.current = false;
        safeSetLoading(false);
      },
      setError: safeSetError,
      abortSignal: abortController.getSignal(),
    };
  }, [abortController.getSignal, safeSetError, safeSetLoading]);

  return {
    loading,
    error,
    isMounted,
    isProcessingRef,
    abortController,
    safeSetLoading,
    safeSetError,
    createProcessingSession,
  };
}
