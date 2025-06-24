import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { modals } from '@mantine/modals';
import { useCallback } from 'react';

import { DatasourceWizardModal } from './datasource-wizard-modal';

export const useOpenDatasourceWizard = () => {
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();

  return useCallback(() => {
    const modalId = modals.open({
      size: 700,
      withCloseButton: false,
      padding: 0,
      children: (
        <DatasourceWizardModal
          onClose={() => modals.close(modalId)}
          handleAddFile={handleAddFile}
          handleAddFolder={handleAddFolder}
        />
      ),
    });
  }, [handleAddFile, handleAddFolder]);
};
