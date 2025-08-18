import { exportSQLScripts } from '@controllers/export-data';
import { Button } from '@mantine/core';

export const ExportQueriesSection = () => {
  const downloadArchive = async () => {
    const archiveBlob = await exportSQLScripts();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'queries.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Button className="w-fit" onClick={downloadArchive} variant="outline">
      Export All
    </Button>
  );
};
