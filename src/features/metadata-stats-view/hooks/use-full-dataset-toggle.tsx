import { useCallback, useState } from 'react';

/**
 * Hook for managing full dataset calculation toggle
 *
 * This hook provides state management for switching between sample-based
 * and full dataset metadata calculations.
 */
export function useFullDatasetToggle() {
  const [useFullDataset, setUseFullDataset] = useState(false);

  /**
   * Toggles between sample and full dataset calculation
   */
  const toggleFullDataset = useCallback(() => {
    setUseFullDataset((prev) => !prev);
  }, []);

  /**
   * Explicitly enables full dataset calculation
   */
  const enableFullDataset = useCallback(() => {
    setUseFullDataset(true);
  }, []);

  /**
   * Explicitly disables full dataset calculation (returns to sampling)
   */
  const disableFullDataset = useCallback(() => {
    setUseFullDataset(false);
  }, []);

  return {
    useFullDataset,
    toggleFullDataset,
    enableFullDataset,
    disableFullDataset,
  };
}
