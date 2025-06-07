import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';

import { showAlert, showError, showWarning } from '@components/app-notifications';
import { addLocalFileOrFolders } from '@controllers/file-system/file-system-controller';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import {
  LocalEntry,
  supportedDataSourceFileExtArray,
  SUPPORTED_DATA_SOURCE_FILE_EXTS,
} from '@models/file-system';
import { pickFiles, pickFolder } from '@utils/file-system';

export const useAddLocalFilesOrFolders = () => {
  const pool = useDuckDBConnectionPool();

  const handleAddFile = useCallback(
    async (exts: supportedDataSourceFileExtArray = SUPPORTED_DATA_SOURCE_FILE_EXTS) => {
      // TODO: we should see if we ca avoid calling this hook in uninitialized
      // state, and instead of this check, use `useInitializedDuckDBConnection`
      // to get the non-null connection
      if (!pool) {
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

      const { skippedExistingEntries, skippedUnsupportedFiles, skippedEmptySheets, errors } =
        await addLocalFileOrFolders(pool, handles);

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

      if (skippedEmptySheets.length) {
        skippedEmptySheets.forEach(({ fileName, sheets }) => {
          showWarning({
            title: 'Warning',
            message: `Skipped empty sheets in ${fileName}: ${sheets.join(', ')}`,
          });
        });
      }
      errors.forEach((errorMessage) => {
        showError({
          title: 'Error',
          message: errorMessage,
        });
      });
    },
    [pool],
  );

  const handleAddFolder = useCallback(async () => {
    // TODO: we should see if we ca avoid calling this hook in uninitialized
    // state, and instead of this check, use `useInitializedDuckDBConnection`
    // to get the non-null connection
    if (!pool) {
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
    const {
      skippedExistingEntries,
      skippedUnsupportedFiles,
      skippedEmptyFolders,
      skippedEmptySheets,
      errors,
    } = await addLocalFileOrFolders(pool, [handle]);
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
    if (skippedEmptySheets.length) {
      skippedEmptySheets.forEach(({ fileName, sheets }) => {
        showWarning({
          title: 'Warning',
          message: `Skipped empty sheets in ${fileName}: ${sheets.join(', ')}`,
        });
      });
    }

    errors.forEach((errorMessage) => {
      showError({
        title: 'Error',
        message: errorMessage,
      });
    });
  }, [pool]);

  const handleFileDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (!pool) {
        showError({
          title: 'App is not ready',
          message: 'Please wait for app to load before adding files',
        });
        return;
      }

      const fileHandlesPromises = [...e.dataTransfer.items].map((item) =>
        item.getAsFileSystemHandle(),
      );

      const handles = [];

      for await (const handle of fileHandlesPromises) {
        if (!handle) {
          continue;
        }
        handles.push(handle as FileSystemFileHandle | FileSystemDirectoryHandle);
      }

      const notificationId = showAlert({
        title: 'Processing dropped items',
        loading: true,
        message: 'Please wait while we process the dropped files/folders...',
        autoClose: false,
        color: 'text-accent',
      });

      try {
        if (handles.length === 0) {
          notifications.hide(notificationId);
          showAlert({
            title: 'No valid items',
            message: 'No supported files or folders were found in the dropped items.',
          });
        }

        const { skippedExistingEntries, skippedUnsupportedFiles, errors } =
          await addLocalFileOrFolders(pool, handles);

        notifications.hide(notificationId);
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
        if (errors.length) {
          errors.forEach((errorMessage) => {
            showError({
              title: 'Error',
              message: errorMessage,
            });
          });
        }
      } catch (error) {
        notifications.hide(notificationId);
        showError({
          title: 'Error processing dropped items',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [pool],
  );

  return {
    handleAddFile,
    handleAddFolder,
    handleFileDrop,
  };
};
