import JSZip from 'jszip';
import { handleError } from '@utils/error-handling';

import { useAppStore } from '../store/app-store';

/**
 * Exports script files as a zip file.
 * @returns {Promise<Blob | null>} A promise that resolves to a Blob containing the zip file or null if an error occurs.
 */
export async function exportSQLScripts(): Promise<Blob | null> {
  const { sqlScripts } = useAppStore.getState();
  const zip = new JSZip();

  for (const sqlScript of sqlScripts.values()) {
    zip.file(`${sqlScript.name}.sql`, sqlScript.content);
  }

  try {
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
  } catch (error) {
    handleError(error, {
      operation: 'exportSQLScripts',
      userAction: 'export SQL scripts',
      details: { scriptCount: sqlScripts.size },
    });
    return null;
  }
}
