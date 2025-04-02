import { useAppNotifications } from '@components/app-notifications';
import { useAppContext } from '@features/app-context';
import { getSupportedMimeType } from '@utils/helpers';

export const useFileHandlers = () => {
  const { onAddDataSources } = useAppContext();
  const { showError } = useAppNotifications();

  const handleFileUpload = async (accept = ['.parquet', '.csv', '.json'] as FileExtension[]) => {
    try {
      const fileHandles = await window.showOpenFilePicker({
        types: [
          {
            description: 'Datasets',
            accept: {
              'application/octet-stream': accept,
            },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: true,
      });
      await onAddDataSources(
        fileHandles.map((handle) => ({
          filename: handle.name,
          type: 'FILE_HANDLE',
          entry: handle,
        })),
      );
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const handleFolderUpload = async () => {
    try {
      const fileHandles = await window.showDirectoryPicker({
        mode: 'read',
      });

      const handles: FileSystemFileHandle[] = [];
      for await (const [name, handle] of fileHandles.entries()) {
        const isFile = handle.kind === 'file';
        const meta = getSupportedMimeType(name);
        if (meta && isFile) {
          handles.push(handle);
        }
      }
      await onAddDataSources(
        handles.map((handle) => ({
          filename: handle.name,
          type: 'FILE_HANDLE',
          entry: handle,
        })),
      );
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const handleAddSource =
    (sourceType: 'folder' | 'file', accept = ['.parquet', '.csv', '.json'] as FileExtension[]) =>
    () => {
      if ('showDirectoryPicker' in window && 'showOpenFilePicker' in window) {
        if (sourceType === 'folder') {
          handleFolderUpload();
        } else {
          handleFileUpload(accept);
        }
      } else {
        showError({
          title: 'Error',
          message: 'File upload is not supported in this browser',
        });
      }
    };

  return { handleFileUpload, handleFolderUpload, handleAddSource };
};
