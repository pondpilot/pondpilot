import { CSVDataSource, DataSourceId } from '@models/data-source';
import { DataSourceLocalFile } from '@models/file-system';
import { v4 as uuidv4 } from 'uuid';

export function createCSVDataSource(
  fileSource: DataSourceLocalFile,
  getUniqueViewName: (name: string) => string,
): CSVDataSource {
  const dataSourceId = uuidv4() as DataSourceId;
  const viewName = getUniqueViewName(fileSource.name);
  const fqn = `memory.main.${viewName}`;

  return {
    type: 'csv',
    id: dataSourceId,
    fileSourceId: fileSource.id,
    displayName: viewName,
    // For now we assume that our memory.main schema is the default one.
    getQueryableName: async (_) => viewName,
    getFullyQualifiedName: () => fqn,
    getRowCount: async (db) => {
      const result = await db.query(`SELECT COUNT(*) FROM ${fqn}`);
      const count = Number(result.getChildAt(0)?.get(0));
      return count;
    },
    getReader: async (db) => {
      const reader = await db.send(`SELECT * FROM ${fqn}`);
      return reader;
    },
  };
}
