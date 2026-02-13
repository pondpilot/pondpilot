import { showError, showWarning } from '@components/app-notifications';
import { importSQLFilesAndCreateScripts } from '@controllers/file-system';

import { fileSystemService } from './file-system-adapter';
import { importNotebookFromFile, isNotebookFileName } from './import-notebook-file';

const isSqlScriptFileName = (name: string): boolean => name.toLowerCase().endsWith('.sql');

export const importSQLFiles = async (): Promise<void> => {
  try {
    const result = await fileSystemService.pickFiles({
      accept: {
        'application/octet-stream': ['.sql', '.sqlnb'],
        'application/json': ['.sqlnb'],
      },
      description: 'Import Query Files',
      multiple: true,
      excludeAcceptAllOption: false,
    });

    if (result.success && result.type === 'native') {
      const sqlHandles = result.handles.filter((handle) => isSqlScriptFileName(handle.name));
      const notebookHandles = result.handles.filter((handle) => isNotebookFileName(handle.name));

      if (sqlHandles.length > 0) {
        await importSQLFilesAndCreateScripts(sqlHandles);
      }

      for (const handle of notebookHandles) {
        const file = await handle.getFile();
        await importNotebookFromFile(file);
      }
    } else if (result.success && result.type === 'fallback') {
      const notebookFiles = result.files.filter((file) => isNotebookFileName(file.name));
      const sqlFileCount = result.files.filter((file) => isSqlScriptFileName(file.name)).length;

      for (const file of notebookFiles) {
        await importNotebookFromFile(file);
      }

      if (sqlFileCount > 0) {
        showWarning({
          title: 'Partial import in this browser',
          message: 'Notebook files were imported, but .sql script imports require Chrome or Edge.',
        });
      }
    } else if (!result.success && !result.userCancelled) {
      showError({
        title: 'Import Error',
        message: result.error || 'Failed to import query files',
      });
    }
  } catch (error) {
    console.error('Error importing SQL files: ', error);
    showError({
      title: 'Cannot import queries',
      message: 'Failed to import query files',
    });
  }
};
