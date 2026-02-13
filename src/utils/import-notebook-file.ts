import { showError, showSuccess } from '@components/app-notifications';
import { createNotebookFromImport } from '@controllers/notebook/notebook-controller';
import { getOrCreateTabFromNotebook } from '@controllers/tab/notebook-tab-controller';

import { fileSystemService } from './file-system-adapter';
import { parseSqlnb } from './notebook-export';

export const isNotebookFileName = (name: string): boolean => name.toLowerCase().endsWith('.sqlnb');

/**
 * Opens a file picker for .sqlnb files and imports them as notebooks.
 */
export const importNotebookFiles = async (): Promise<void> => {
  try {
    const result = await fileSystemService.pickFiles({
      accept: {
        'application/json': ['.sqlnb'],
      },
      description: 'Import Notebook Files',
      multiple: true,
      excludeAcceptAllOption: false,
    });

    if (result.success && result.type === 'native') {
      for (const handle of result.handles) {
        const file = await handle.getFile();
        await importNotebookFromFile(file);
      }
    } else if (result.success && result.type === 'fallback') {
      for (const file of result.files) {
        await importNotebookFromFile(file);
      }
    } else if (!result.success && !result.userCancelled) {
      showError({
        title: 'Import Error',
        message: result.error || 'Failed to import notebook files',
      });
    }
  } catch (error) {
    console.error('Error importing notebook files: ', error);
    showError({
      title: 'Cannot import notebook',
      message: 'Failed to import notebook files',
    });
  }
};

/**
 * Imports a notebook from a single File object.
 * Returns true if import succeeded, false otherwise.
 */
export const importNotebookFromFile = async (file: File): Promise<boolean> => {
  try {
    if (!isNotebookFileName(file.name)) {
      return false;
    }

    const content = await file.text();
    const sqlnb = parseSqlnb(content);

    const notebook = createNotebookFromImport(sqlnb.name, sqlnb.cells, sqlnb.parameters);
    getOrCreateTabFromNotebook(notebook.id, true);

    showSuccess({
      title: 'Notebook imported',
      message: `"${notebook.name}" imported with ${sqlnb.cells.length} cell${sqlnb.cells.length !== 1 ? 's' : ''}.`,
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during import';
    console.error('Error importing notebook file:', error);
    showError({
      title: `Cannot import "${file.name}"`,
      message,
    });
    return false;
  }
};
