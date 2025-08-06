import { useAppStore } from '@store/app-store';
import { fileSystemService } from '@utils/file-system-adapter';
import { useEffect } from 'react';

/**
 * Hook that warns users before leaving the page if they have loaded files
 * in browsers that don't support persistent file handles
 */
export function useBeforeUnloadProtection() {
  const localEntries = useAppStore.use.localEntries();
  const dataSources = useAppStore.use.dataSources();

  useEffect(() => {
    // Only add protection for browsers without persistent file handle support
    if (fileSystemService.canPersistHandles()) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there are any file entries or file-based data sources
      const hasFiles = localEntries.size > 0;
      const hasFileDataSources = Array.from(dataSources.values()).some(
        (ds) => ds.type !== 'attached-db' && ds.type !== 'remote-db',
      );

      if (hasFiles || hasFileDataSources) {
        // Modern browsers require setting returnValue
        const message =
          'You have loaded files that will need to be re-selected after refresh. Are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [localEntries, dataSources]);
}
