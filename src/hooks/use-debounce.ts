import { useCallback, useRef, useEffect, useState } from 'react';

type DebouncedFunction<T extends (...args: any[]) => any> = (
  ...args: Parameters<T>
) => void | Promise<void>;

/**
 * Custom hook that creates a debounced version of a function.
 * The debounced function will only execute after the specified delay
 * has passed without any new calls.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced version of the function and a cancel function
 */
export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): [DebouncedFunction<T>, () => void] {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(fn);

  // Update the callback ref when fn changes
  useEffect(() => {
    callbackRef.current = fn;
  }, [fn]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay, cancel],
  ) as DebouncedFunction<T>;

  // Clean up on unmount
  useEffect(() => {
    return cancel;
  }, [cancel]);

  return [debouncedFn, cancel];
}

/**
 * Custom hook for debouncing a value.
 * Returns the debounced value that only updates after the specified delay.
 *
 * @param value The value to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [value, delay]);

  return debouncedValue;
}
