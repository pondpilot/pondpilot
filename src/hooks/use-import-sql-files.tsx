import { useAppNotifications } from '@components/app-notifications';
import { importSQLFilesAndCreateScripts } from '@controllers/file-system/file-system-controller';
import { pickFiles } from '@utils/file-system';

export const useImportSQLFiles = () => {
  const { showError } = useAppNotifications();

  const importSQLFiles = async (): Promise<void> => {
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

  return { importSQLFiles };
};
