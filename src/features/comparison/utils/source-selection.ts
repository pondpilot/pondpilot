import { AnyDataSource, AnyFlatFileDataSource } from '@models/data-source';
import { ComparisonSource } from '@models/tab';

/**
 * Converts a data source selection to a ComparisonSource
 *
 * @param dataSource - The data source to convert
 * @param schemaName - The schema name (for database sources)
 * @param tableName - The table/view name (for database sources)
 * @returns A ComparisonSource object or null if the conversion fails
 */
export function dataSourceToComparisonSource(
  dataSource: AnyDataSource,
  schemaName?: string,
  tableName?: string,
): ComparisonSource | null {
  // Handle database sources (attached or remote)
  if (dataSource.type === 'attached-db' || dataSource.type === 'remote-db') {
    if (!schemaName || !tableName) {
      console.error(
        'dataSourceToComparisonSource: schemaName and tableName required for database sources',
      );
      return null;
    }

    return {
      type: 'table',
      tableName,
      schemaName,
      databaseName: dataSource.dbName,
    };
  }

  // Handle flat file sources - treat them as tables/views since they're already loaded as views
  const flatFileSource = dataSource as AnyFlatFileDataSource;

  return {
    type: 'table',
    tableName: flatFileSource.viewName,
    schemaName: 'main',
    databaseName: 'pondpilot',
  };
}
