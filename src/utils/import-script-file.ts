import { showError } from '@components/app-notifications';
import { importSQLFilesAndCreateScripts } from '@controllers/file-system';

import { pickFiles } from './file-system';

export const importSQLFiles = async (): Promise<void> => {
  try {
    const fileHandles = await pickFiles(['.sql'], 'Import SQL Files');
    importSQLFilesAndCreateScripts(fileHandles.handles);
  } catch (error) {
    console.error('Error importing SQL files: ', error);
    showError({
      title: 'Import Error',
      message: 'Failed to import SQL files',
    });
  }
};
