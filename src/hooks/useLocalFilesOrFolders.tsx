import { useAppNotifications } from '@components/app-notifications';
import { useDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { supportedDataSourceFileExtArray, supportedDataSourceFileExts } from '@models/file-system';
import { addLocalFileOrFolders } from '@store/app-store';
import { pickFiles, pickFolder } from '@utils/file-system';

export const useLocalFilesOrFolders = () => {
  const { showError, showWarning } = useAppNotifications();

  // TODO: we should be able to use non-null hook with db-conn,
  // but to do that, we need to extract the "plus" as a separate component
  // that is only loaded after app is ready
  // const { db, conn } = useInitializedDuckDBConnection();
  // @mishamsk , We can handle it just using the appLoadState with disabled state.
  const { db, conn } = useDuckDBConnection();

  const handleAddFile = async (
    exts: supportedDataSourceFileExtArray = supportedDataSourceFileExts,
  ) => {
    const { handles, error } = await pickFiles(
      exts.map((dotlessExt) => `.${dotlessExt}` as FileExtension),
      'Data Sources',
    );

    if (error) {
      showError({ title: 'Failed to add files', message: error });
      return;
    }

    const { skippedExistingEntries, skippedUnsupportedFiles, errors } = await addLocalFileOrFolders(
      db!,
      conn!,
      handles,
    );

    if (skippedExistingEntries.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedExistingEntries.length} files were not added because they already exist.`,
      });
    }

    if (skippedUnsupportedFiles.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedUnsupportedFiles.length} files were not added because they are not supported.`,
      });
    }

    errors.forEach((errorMessage) => {
      showError({
        title: 'Error',
        message: errorMessage,
      });
    });
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

    // Folders are always supported, so no point in checking the second return value
    const { skippedExistingEntries } = await addLocalFileOrFolders(db!, conn!, [handle]);

    if (skippedExistingEntries.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedExistingEntries.length} folders were not added because they already exist.`,
      });
    }
  };

  return {
    handleAddFile,
    handleAddFolder,
  };
};
