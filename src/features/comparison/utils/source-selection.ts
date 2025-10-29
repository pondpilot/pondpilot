import { AnyDataSource, AnyFlatFileDataSource } from '@models/data-source';
import { CSV_MAX_LINE_SIZE } from '@models/db';
import { ComparisonSource } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

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

  // Handle flat file sources - need to generate query-based ComparisonSource
  const flatFileSource = dataSource as AnyFlatFileDataSource;

  // Build the SQL query based on file type
  let sql: string;
  const alias = flatFileSource.viewName;

  switch (flatFileSource.type) {
    case 'csv':
      // For CSV files, use read_csv with proper configuration
      sql = `SELECT * FROM read_csv(${quote(flatFileSource.viewName, { single: true })}, strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE})`;
      break;

    case 'json':
      // For JSON files, use direct reference to the view
      sql = `SELECT * FROM ${toDuckDBIdentifier(flatFileSource.viewName)}`;
      break;

    case 'parquet':
      // For Parquet files, use direct reference to the view
      sql = `SELECT * FROM ${toDuckDBIdentifier(flatFileSource.viewName)}`;
      break;

    case 'xlsx-sheet':
      // For Excel sheets, use read_xlsx with sheet name
      sql = `SELECT * FROM read_xlsx(${quote(flatFileSource.viewName, { single: true })}, sheet=${quote(flatFileSource.sheetName, { single: true })}, ignore_errors=true)`;
      break;

    default:
      console.error(
        `dataSourceToComparisonSource: Unsupported data source type: ${(dataSource as any).type}`,
      );
      return null;
  }

  return {
    type: 'query',
    sql,
    alias,
  };
}
