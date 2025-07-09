import { SQLScript } from '@models/sql-script';
import { sanitizeFileName } from '@utils/export-data';

/**
 * Exports a single SQL script as a .sql file
 * @param script - The SQL script to export
 */
export const exportSingleScript = (script: SQLScript): void => {
  const fileName = `${sanitizeFileName(script.name)}.sql`;
  const { content } = script;

  // Create download link
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};
