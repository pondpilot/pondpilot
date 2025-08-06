import { showError } from '@components/app-notifications';
import { importSQLFilesAndCreateScripts } from '@controllers/file-system';

import { pickFiles } from './file-picker-utils';

export const importSQLFiles = async (): Promise<void> => {
  try {
    const { handles, error } = await pickFiles(['.sql'], 'Import SQL Files');
    
    if (error) {
      showError({
        title: 'Import Error',
        message: error,
      });
      return;
    }
    
    if (handles.length > 0) {
      importSQLFilesAndCreateScripts(handles);
    }
  } catch (error) {
    console.error('Error importing SQL files: ', error);
    showError({
      title: 'Cannot import script',
      message: 'Failed to import SQL files',
    });
  }
};
