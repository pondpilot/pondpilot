import { cleanupStaleComparisonProgress, useAppStore } from '@store/app-store';
import { setDataTestId } from '@utils/test-id';
import { useEffect } from 'react';

import { PROGRESS_CLEANUP_INTERVAL_MS } from '../comparison/config/execution-config';

export const AppState = () => {
  const appLoadState = useAppStore.use.appLoadState();

  // Periodically cleanup stale comparison progress entries to prevent memory leaks
  useEffect(() => {
    // Run cleanup at configured interval
    const intervalId = setInterval(() => {
      cleanupStaleComparisonProgress();
    }, PROGRESS_CLEANUP_INTERVAL_MS);

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div
      data-testid={setDataTestId('app-state')}
      data-app-load-state={appLoadState}
      style={{ display: 'none' }}
    />
  );
};
