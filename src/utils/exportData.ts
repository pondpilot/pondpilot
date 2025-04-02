import { queryStoreApi } from '@store/app-idb-store';
import JSZip from 'jszip';

/**
 * Exports query files as a zip file.
 * @returns {Promise<Blob | null>} A promise that resolves to a Blob containing the zip file or null if an error occurs.
 */
export async function exportQueryFiles(): Promise<Blob | null> {
  const queryFiles = await queryStoreApi.getQueryFiles();
  const zip = new JSZip();

  for (const queryFile of queryFiles) {
    zip.file(`${queryFile.name}.${queryFile.ext}`, queryFile.content);
  }

  try {
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
  } catch (error) {
    console.error('Error while exporting query files: ', error);
    return null;
  }
}
