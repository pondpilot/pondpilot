import { useAppNotifications } from '@components/app-notifications';
import { useDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { supportedDataSourceFileExts } from '@models/file-system';
import { addLocalFileOrFolders } from '@store/init-store';
import { pickFiles, pickFolder } from '@utils/file-system';

export const useLocalFilesOrFolders = () => {
  const { showError } = useAppNotifications();
  // TODO: we should be able to use non-null hook with db-conn,
  // but to do that, we need to extract the "plus" as a separate component
  // that is only loaded after app is ready
  // const { db, conn } = useInitializedDuckDBConnection();

  // @mishamsk , We can handle it just using the appLoadState with disabled state.
  const { db, conn } = useDuckDBConnection();

  const handleAddFile = async (exts = supportedDataSourceFileExts) => {
    const { handles, error } = await pickFiles(exts, 'Data Sources');

    if (error) {
      showError({ title: 'Failed to add files', message: error });
      return;
    }

    await addLocalFileOrFolders(db!, conn!, handles);
  };

  const handleAddFolder = async () => {
    const { handle, error } = await pickFolder();

    if (error) {
      showError({ title: 'Failed to add folder', message: error });
      return;
    }

    if (!handle) {
      showError({ title: 'Failed to add folder', message: 'Handle is null' });
      return;
    }

    await addLocalFileOrFolders(db!, conn!, [handle]);
  };

  return {
    handleAddFile,
    handleAddFolder,
  };
};
