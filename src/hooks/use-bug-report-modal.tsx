import { BugReportModal } from '@features/bug-report-modal';
import { useFeatureContext } from '@features/feature-context';
import { modals } from '@mantine/modals';
import { useCallback } from 'react';

/**
 * Hook that provides a function to open the bug report modal.
 * Handles feature context injection and modal lifecycle management.
 */
export function useBugReportModal() {
  const featureContext = useFeatureContext();

  const openBugReportModal = useCallback(() => {
    const modalId = modals.open({
      size: 600,
      withCloseButton: true,
      centered: true,
      closeOnClickOutside: false,
      title: 'Report a Bug or Request a Feature',
      children: (
        <BugReportModal onClose={() => modals.close(modalId)} featureContext={featureContext} />
      ),
    });
  }, [featureContext]);

  return { openBugReportModal };
}
