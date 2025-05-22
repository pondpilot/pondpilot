import { useHotkeys } from '@mantine/hooks';
import { useState, useCallback } from 'react';

/**
 * Custom hook to manage metadata stats panel state
 * Unifies the metadata stats button logic across different tab views
 */
export function useMetadataStatsState() {
  const [metadataStatsOpened, setMetadataStatsOpened] = useState(false);

  const toggleMetadataStats = useCallback(() => {
    setMetadataStatsOpened((prev) => !prev);
  }, []);

  const openMetadataStats = useCallback(() => {
    setMetadataStatsOpened(true);
  }, []);

  const closeMetadataStats = useCallback(() => {
    setMetadataStatsOpened(false);
  }, []);

  // Add keyboard shortcuts for metadata stats panel
  useHotkeys([['Ctrl+M', toggleMetadataStats]]);

  return {
    metadataStatsOpened,
    setMetadataStatsOpened,
    toggleMetadataStats,
    openMetadataStats,
    closeMetadataStats,
  };
}
