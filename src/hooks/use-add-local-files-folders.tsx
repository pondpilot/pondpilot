import { showAlert, showError, showWarning } from '@components/app-notifications';
import { addLocalFileOrFolders } from '@controllers/file-system/file-system-controller';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { notifications } from '@mantine/notifications';
import {
  LocalEntry,
  supportedDataSourceFileExtArray,
  supportedDataSourceFileExts,
} from '@models/file-system';
import { pickFiles, pickFolder } from '@utils/file-system';

export const useAddLocalFilesOrFolders = () => {
  const conn = useDuckDBConnectionPool();

  const handleAddFile = async (
    exts: supportedDataSourceFileExtArray = supportedDataSourceFileExts,
  ) => {
    // TODO: we should see if we ca avoid calling this hook in uninitialized
    // state, and instead of this check, use `useInitializedDuckDBConnection`
    // to get the non-null connection
    if (!conn) {
      showError({
        title: 'App is not ready',
        message: 'Please wait for app to load before adding files',
      });
      return;
    }

    const { handles, error } = await pickFiles(
      exts.map((dotlessExt) => `.${dotlessExt}` as FileExtension),
      'Data Sources',
    );

    if (error) {
      showError({ title: 'Failed to add files', message: error });
      return;
    }

    if (!handles.length) {
      showAlert({ title: 'Adding files', message: 'No files selected' });
      return;
    }

    const { skippedExistingEntries, skippedUnsupportedFiles, errors } = await addLocalFileOrFolders(
      conn,
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
    // TODO: we should see if we ca avoid calling this hook in uninitialized
    // state, and instead of this check, use `useInitializedDuckDBConnection`
    // to get the non-null connection
    if (!conn) {
      showError({
        title: 'App is not ready',
        message: 'Please wait for app to load before adding files',
      });
      return;
    }

    const { handle, error } = await pickFolder();

    if (error) {
      showError({ title: 'Failed to add folder', message: error });
      return;
    }

    if (!handle) {
      showAlert({ title: 'Adding folder', message: 'No folder selected' });
      return;
    }

    const notificationId = showAlert({
      title: 'Adding folder',
      loading: true,
      message: '',
      autoClose: false,
      color: 'text-accent',
    });
    const { skippedExistingEntries, skippedUnsupportedFiles, skippedEmptyFolders } =
      await addLocalFileOrFolders(conn, [handle]);
    notifications.hide(notificationId);

    const skippedExistingFolders: LocalEntry[] = [];
    const skippedExistingFiles: LocalEntry[] = [];
    for (const entry of skippedExistingEntries) {
      if (entry.kind === 'directory') {
        skippedExistingFolders.push(entry);
      } else {
        skippedExistingFiles.push(entry);
      }
    }

    if (skippedExistingFolders.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedExistingFolders.length} folders were not added because they already exist.`,
      });
    }

    if (skippedExistingFiles.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedExistingFiles.length} files were not added because they already exist.`,
      });
    }

    if (skippedUnsupportedFiles.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedUnsupportedFiles.length} files were not added because they are not supported.`,
      });
    }

    if (skippedEmptyFolders.length) {
      showWarning({
        title: 'Warning',
        message: `${skippedEmptyFolders.length} folders were not added because no supported files were found.`,
      });
    }
  };

  return {
    handleAddFile,
    handleAddFolder,
  };
};
