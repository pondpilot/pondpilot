import { useCreateMultipleQueryFilesMutation } from '@store/app-idb-store';
import { useAppNotifications } from '@components/app-notifications';

export const useImportSQLFiles = () => {
  const { showError } = useAppNotifications();
  const { mutateAsync: createMultipleQueryFiles } = useCreateMultipleQueryFilesMutation();

  const importSQLFiles = async (): Promise<void> => {
    try {
      const fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'SQL files',
            accept: { 'text/sql': ['.sql'] },
          },
        ],
      });

      // TODO: Create interface
      const importedEntries: { name: string; content: string }[] = [];

      for (const handle of fileHandles) {
        const file = await handle.getFile();
        const name = file.name.replace(/\.sql$/, '');
        const content = await file.text();
        importedEntries.push({
          name,
          content,
        });
      }

      if (importedEntries.length) {
        await createMultipleQueryFiles({ entities: importedEntries });
      }
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
