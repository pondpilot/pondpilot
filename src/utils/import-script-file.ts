import { showError } from '@components/app-notifications';
import { importSQLFilesAndCreateScripts } from '@controllers/file-system';

import { fileSystemService } from './file-system-adapter';

export const importSQLFiles = async (): Promise<void> => {
  try {
    const result = await fileSystemService.pickFiles({
      accept: {
        'application/octet-stream': ['.sql'],
      },
      description: 'Import SQL Files',
      multiple: true,
      excludeAcceptAllOption: false,
    });

    if (result.success && result.type === 'native') {
      importSQLFilesAndCreateScripts(result.handles);
    } else if (result.success && result.type === 'fallback') {
      showError({
        title: 'Browser Limitation',
        message: 'File imports require Chrome or Edge browser for full functionality',
      });
    } else if (!result.success && !result.userCancelled) {
      showError({
        title: 'Import Error',
        message: result.error || 'Failed to import SQL files',
      });
    }
  } catch (error) {
    console.error('Error importing SQL files: ', error);
    showError({
      title: 'Import Error',
      message: 'Failed to import SQL files',
    });
  }
};
