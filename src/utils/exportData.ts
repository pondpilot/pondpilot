import { queryStoreApi } from '@store/app-idb-store';
import JSZip from 'jszip';

export async function exportQueryFiles() {
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
