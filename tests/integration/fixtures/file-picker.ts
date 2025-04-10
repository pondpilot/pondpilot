import { test as base } from '@playwright/test';
import { parsePath } from '../../utils';

interface FilePicker {
  // Playwright does not support it (https://github.com/microsoft/playwright/issues/8850).
  // So we have to patch the files and directory pickers Browser API.

  // Works only for files located in the browser's storage.
  // To load local files to the browser's storage, use the `Storage` fixture.

  /**
   * Patches the file picker to return the specified files without opening the file picker dialog.
   * @param filePaths - The relative paths to the files in the browser's storage.
   */
  selectFiles: (filePaths: string[]) => Promise<void>;

  /**
   * Patches the directory picker to return the specified directory without opening the directory picker dialog.
   * @param dirPath - The relative path to the directory in the browser's storage.
   */
  selectDir: (dirPath: string) => Promise<void>;
}

type FilePickerFixtures = {
  filePicker: FilePicker;
};

export const test = base.extend<FilePickerFixtures>({
  filePicker: async ({ page }, use) => {
    // Use `Object.defineProperty()` instead of just `window.prop = ...` to ignore complex type signature with overloading.
    // Only expected return type is important here.
    const filePicker: FilePicker = {
      selectFiles: async (filePaths: string[]) => {
        await page.evaluate(
          (storagePaths) => {
            Object.defineProperty(window, 'showOpenFilePicker', {
              value: async (): Promise<FileSystemFileHandle[]> => {
                const ret: FileSystemFileHandle[] = [];
                for (const filePath of storagePaths) {
                  let dirHandle = await navigator.storage.getDirectory();
                  for (const dir of filePath.dirs) {
                    dirHandle = await dirHandle.getDirectoryHandle(dir);
                  }
                  const fileHandle = await dirHandle.getFileHandle(filePath.basename);
                  ret.push(fileHandle);
                }
                return ret;
              },
            });
          },
          filePaths.map((path) => parsePath(path)),
        );
      },
      selectDir: async (dirPath: string) => {
        await page.evaluate((storagePath) => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            value: async (): Promise<FileSystemDirectoryHandle> => {
              let dirHandle = await navigator.storage.getDirectory();
              for (const dir of storagePath.parts) {
                dirHandle = await dirHandle.getDirectoryHandle(dir);
              }
              return dirHandle;
            },
          });
        }, parsePath(dirPath));
      },
    };
    await use(filePicker);
  },
});
