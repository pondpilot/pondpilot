import { useDuckDBInitializerStatus } from '@features/duckdb-context/duckdb-context';
import { Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useEffect, useRef } from 'react';

export const useDevModal = (isFileAccessApiSupported: boolean) => {
  if (!import.meta.env.DEV && !isFileAccessApiSupported) {
    // no-op in production or for unsupported browsers
    return null;
  }

  const { state: dbInitState, message } = useDuckDBInitializerStatus();
  const modalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (dbInitState !== 'ready' && dbInitState !== 'none' && !modalIdRef.current) {
      // Open modal if we started the initialization
      modalIdRef.current = modals.open({
        size: 'lg',
        centered: true,
        closeOnClickOutside: false,
        closeOnEscape: false,
        withCloseButton: true,
        children: (
          <Stack align="center" gap="md" py="lg">
            <Text size="lg" mb="sm">
              DuckDB init progress
            </Text>
            <Text size="sm" c="dimmed">
              {dbInitState === 'error' ? 'DuckDB Failed to initialize' : message}
            </Text>
          </Stack>
        ),
      });
    } else if (dbInitState !== 'ready' && modalIdRef.current) {
      // Update modal whith new message as initialization progresses
      modals.updateModal({
        modalId: modalIdRef.current,
        children: (
          <Stack align="center" gap="md" py="lg">
            <Text size="lg" mb="sm">
              DuckDB init progress
            </Text>
            <Text size="sm" c="dimmed">
              {dbInitState === 'error' ? 'DuckDB Failed to initialize' : message}
            </Text>
          </Stack>
        ),
      });
    } else if (dbInitState === 'ready' && modalIdRef.current) {
      // Close modal only if eventually ready. Error will stay open
      modals.close(modalIdRef.current);
      modalIdRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (modalIdRef.current) {
        modals.close(modalIdRef.current);
      }
    };
  }, [dbInitState, message]);

  return null;
};
