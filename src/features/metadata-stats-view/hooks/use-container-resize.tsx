import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_DEBOUNCE_MS,
  MIN_WIDTH_FOR_CALCULATION,
} from '../constants';

/**
 * Simple debounce utility
 */
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Hook for detecting container resize and providing current width
 * @param initialWidth - Initial width to use before first measurement
 * @param debounceMs - Debounce delay in milliseconds (default: 200ms)
 * @returns Object with containerRef and containerWidth
 */
export function useContainerResize(
  initialWidth: number = DEFAULT_CONTAINER_WIDTH,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
) {
  const [containerWidth, setContainerWidth] = useState(initialWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateWidth = useCallback(() => {
    try {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        if (newWidth >= MIN_WIDTH_FOR_CALCULATION) {
          setContainerWidth(newWidth);
        }
      }
    } catch (error) {
      console.warn('Error measuring container width:', error);
    }
  }, []);

  // Create debounced version of updateWidth
  const debouncedUpdateWidth = useCallback(debounce(updateWidth, debounceMs), [
    updateWidth,
    debounceMs,
  ]);

  useEffect(() => {
    // Initial measurement (not debounced)
    updateWidth();

    // Set up debounced resize listener
    window.addEventListener('resize', debouncedUpdateWidth);

    // Cleanup
    return () => {
      window.removeEventListener('resize', debouncedUpdateWidth);
    };
  }, [updateWidth, debouncedUpdateWidth]);

  return useMemo(
    () => ({
      containerRef,
      containerWidth,
    }),
    [containerWidth],
  );
}
