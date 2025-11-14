import { cleanupStaleComparisonProgress } from '@store/app-store';
import { useEffect } from 'react';

import { PROGRESS_CLEANUP_INTERVAL_MS } from '../config/execution-config';

let cleanupIntervalId: NodeJS.Timeout | null = null;
let hookInstanceCount = 0;

/**
 * Sets up periodic cleanup of stale comparison progress entries.
 * Uses a singleton pattern to ensure only one cleanup interval runs
 * globally, even if multiple comparison tabs are open.
 */
export const useComparisonProgressCleanup = () => {
  useEffect(() => {
    hookInstanceCount += 1;

    // Only start the interval if this is the first instance
    if (hookInstanceCount === 1) {
      cleanupIntervalId = setInterval(() => {
        cleanupStaleComparisonProgress();
      }, PROGRESS_CLEANUP_INTERVAL_MS);
    }

    return () => {
      hookInstanceCount -= 1;

      // Only clear the interval when the last instance unmounts
      if (hookInstanceCount === 0 && cleanupIntervalId !== null) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
      }
    };
  }, []);
};
