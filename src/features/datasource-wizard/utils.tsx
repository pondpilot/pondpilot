import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { modals } from '@mantine/modals';
import { cn } from '@utils/ui/styles';

import { DatasourceWizardModal, WizardStep } from './datasource-wizard-modal';

export const useOpenDataWizardModal = () => {
  const pool = useDuckDBConnectionPool();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();

  return {
    openDataWizardModal: (step: WizardStep) => {
      const modalId = modals.open({
        size: 'auto',
        withCloseButton: false,
        padding: 0,
        classNames: {
          content: cn(
            'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark rounded-2xl',
            'w-[56rem] max-w-[calc(100vw-2rem)] min-w-96',
          ),
          header: 'p-4 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        },
        children: (
          <DatasourceWizardModal
            pool={pool}
            onClose={() => modals.close(modalId)}
            initialStep={step}
            handleAddFile={handleAddFile}
            handleAddFolder={handleAddFolder}
          />
        ),
      });
    },
  };
};
