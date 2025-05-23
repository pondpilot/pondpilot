import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { DataBaseModel, DBColumn, DBFunctionsMetadata, DBTableOrView } from '@models/db';
import { getTableColumnId } from '@utils/db';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';

async function queryOneColumn<VT extends arrow.DataType>(
  conn: AsyncDuckDBConnectionPool,
  sql: string,
  columnName: string,
): Promise<arrow.Vector<VT>['TValue'][] | null> {
  const res = await conn.query<Record<string, VT>>(sql);
  const column = res.getChild(columnName);
  if (!column) {
    return null;
  }

  const dbs: arrow.Vector<VT>['TValue'][] = [];
  for (const value of column) {
    if (value) {
      dbs.push(value);
    }
  }
  return dbs;
}

/**
 * Get all user defined databases.
 *
 * @param conn - DuckDB connection
 * @param excludeMemory - Exclude memory database from the result. Default is true.
 * @returns Array of database names or null in case of errors.
 */
export async function getAttachedDBs(
  conn: AsyncDuckDBConnectionPool,
  excludeMemory: boolean = true,
): Promise<string[] | null> {
  const sql = `
    SELECT database_name 
    FROM duckdb_databases
    ${excludeMemory ? "WHERE database_name != 'memory'" : ''}
  `;

  return queryOneColumn<arrow.Utf8>(conn, sql, 'database_name');
}

/**
 * Get all user defined views.
 *
 * @param conn - DuckDB connection
 * @param databaseName - database name to filter by. Default is 'memory'.
 * @param schemaName - schema name to filter by. Default is 'main'.
 * @returns Array of view names or null in case of errors.
 */
export async function getViews(
  conn: AsyncDuckDBConnectionPool,
  databaseName: string = 'memory',
  schemaName: string = 'main',
): Promise<string[] | null> {
  const sql = `
    SELECT view_name 
    FROM duckdb_views
    WHERE database_name == ${quote(databaseName, { single: true })}
      AND schema_name == ${quote(schemaName, { single: true })}
  `;

  return queryOneColumn<arrow.Utf8>(conn, sql, 'view_name');
}

function buildColumnsQueryWithFilters(
  databaseNames?: string[],
  schemaNames?: string[],
  objectNames?: string[],
): string {
  const quotedDatabaseNames = databaseNames?.map((name) => `${quote(name, { single: true })}`);
  const quotedSchemaNames = schemaNames?.map((name) => `${quote(name, { single: true })}`);
  const quotedObjectNames = objectNames?.map((name) => `${quote(name, { single: true })}`);
  const filterByDBName = quotedDatabaseNames && quotedDatabaseNames.length > 0;
  const filterBySchemaName = quotedSchemaNames && quotedSchemaNames.length > 0;
  const filterByObjectName = quotedObjectNames && quotedObjectNames.length > 0;

  return `
    SELECT 
        dt.table_oid is not null as is_table,
        dc.database_name,
        dc.schema_name,
        dc.table_name,
        dc.column_name,
        dc.column_index,
        dc.data_type,
        dc.is_nullable
    FROM duckdb_columns as dc
        LEFT JOIN duckdb_tables as dt             
            ON dc.table_oid = dt.table_oid
    ${filterByDBName || filterBySchemaName || filterByObjectName ? 'WHERE 1=1 ' : ''}
    ${filterByDBName ? `AND dc.database_name in (${quotedDatabaseNames.join(',')}) ` : ''}
    ${filterBySchemaName ? `AND dc.schema_name in (${quotedSchemaNames.join(',')}) ` : ''}
    ${filterByObjectName ? `AND dc.table_name in (${quotedObjectNames.join(',')}) ` : ''}
    ORDER BY dc.database_name, dc.schema_name, dc.table_name, dc.column_index;
  `;
}

type ColumnsQueryArrowType = {
  database_name: arrow.Utf8;
  schema_name: arrow.Utf8;
  table_name: arrow.Utf8;
  is_table: arrow.Bool;
  column_name: arrow.Utf8;
  column_index: arrow.Int32;
  data_type: arrow.Utf8;
  is_nullable: arrow.Bool;
};

type ColumnsQueryReturnType = {
  database_name: string;
  schema_name: string;
  table_name: string;
  is_table: boolean;
  column_name: string;
  column_index: number;
  data_type: string;
  is_nullable: boolean;
};

/**
 * Get all user tables and views with their columns
 *
 * @param databaseNames - Optional database names to filter by
 * @param schemaNames - Optional schema names to filter by
 * @param objectNames - Optional object names to filter by
 * @returns Table and column metadata
 */
async function getTablesAndColumns(
  conn: AsyncDuckDBConnectionPool,
  databaseNames?: string[],
  schemaNames?: string[],
  objectNames?: string[],
): Promise<ColumnsQueryReturnType[]> {
  const sql = buildColumnsQueryWithFilters(databaseNames, schemaNames, objectNames);
  const res = await conn.query<ColumnsQueryArrowType>(sql);

  const columns = {
    database_name: res.getChild('database_name'),
    schema_name: res.getChild('schema_name'),
    table_name: res.getChild('table_name'),
    is_table: res.getChild('is_table'),
    column_name: res.getChild('column_name'),
    column_index: res.getChild('column_index'),
    data_type: res.getChild('data_type'),
    is_nullable: res.getChild('is_nullable'),
  };

  const ret: ColumnsQueryReturnType[] = [];
  for (let i = 0; i < res.numRows; i += 1) {
    const database_name_value = columns.database_name?.get(i);
    const schema_name_value = columns.schema_name?.get(i);
    const table_name = columns.table_name?.get(i);
    const is_table = columns.is_table?.get(i);
    const column_name = columns.column_name?.get(i);
    const column_index = columns.column_index?.get(i);
    const data_type = columns.data_type?.get(i);
    const is_nullable = columns.is_nullable?.get(i);

    // Check if any of the values are null or undefined
    if (
      !database_name_value ||
      !schema_name_value ||
      !table_name ||
      is_table === undefined ||
      is_table === null ||
      !column_name ||
      !column_index ||
      !data_type ||
      is_nullable === undefined ||
      is_nullable === null
    ) {
      continue;
    }

    ret.push({
      database_name: database_name_value,
      schema_name: schema_name_value,
      table_name,
      is_table,
      column_name,
      column_index,
      data_type,
      is_nullable,
    });
  }
  return ret;
}

/**
 * Get all user tables and views with their columns
 *
 * @param conn - DuckDB connection
 * @param databaseNames - Optional database names to filter by
 * @param schemaNames - Optional schema names to filter by
 * @returns Table and column metadata
 */
export async function getDatabaseModel(
  conn: AsyncDuckDBConnectionPool,
  databaseNames?: string[],
  schemaNames?: string[],
): Promise<Map<string, DataBaseModel>> {
  const duckdbColumns = await getTablesAndColumns(conn, databaseNames, schemaNames);
  const dbMap = new Map<string, DataBaseModel>();

  duckdbColumns.forEach((item) => {
    let db = dbMap.get(item.database_name)!;

    if (!db) {
      db = {
        name: item.database_name,
        schemas: [],
      };
      dbMap.set(item.database_name, db);
    }

    let schema = db.schemas.find((s) => s.name === item.schema_name);
    if (!schema) {
      schema = {
        name: item.schema_name,
        objects: [],
      };
      db.schemas.push(schema);
    }

    let tableOrView = schema.objects.find((t) => t.name === item.table_name);
    if (!tableOrView) {
      tableOrView = {
        name: item.table_name,
        label: item.table_name,
        type: item.is_table ? 'table' : 'view',
        columns: [],
      };
      schema.objects.push(tableOrView);
    }

    const column: DBColumn = {
      name: item.column_name,
      databaseType: item.data_type,
      nullable: item.is_nullable,
      sqlType: normalizeDuckDBColumnType(item.data_type),
      id: getTableColumnId(item.column_name, item.column_index),
      columnIndex: item.column_index,
    };
    tableOrView.columns.push(column);
  });

  return dbMap;
}

/**
 * Get models for given object in one schema of one database.
 *
 * @param conn - DuckDB connection
 * @param databaseName - Database name where to search
 * @param schemaName - Schema name where to search
 * @param objectNames - Object names to search for
 * @returns Table and column metadata
 */
export async function getObjectModels(
  conn: AsyncDuckDBConnectionPool,
  databaseName: string,
  schemaName: string,
  objectNames: string[],
): Promise<DBTableOrView[]> {
  if (objectNames.length === 0) return [];

  const duckdbColumns = await getTablesAndColumns(conn, [databaseName], [schemaName], objectNames);

  if (!duckdbColumns) return [];

  const objectMap = new Map<string, DBTableOrView>();

  duckdbColumns.forEach((item) => {
    let tableOrView = objectMap.get(item.table_name);
    if (!tableOrView) {
      tableOrView = {
        name: item.table_name,
        label: item.table_name,
        type: item.is_table ? 'table' : 'view',
        columns: [],
      };
      objectMap.set(item.table_name, tableOrView);
    }

    const column: DBColumn = {
      name: item.column_name,
      databaseType: item.data_type,
      nullable: item.is_nullable,
      sqlType: normalizeDuckDBColumnType(item.data_type),
      id: getTableColumnId(item.column_name, item.column_index),
      columnIndex: item.column_index,
    };
    tableOrView.columns.push(column);
  });

  return Array.from(objectMap.values());
}

/**
 * Get all user defined functions.
 *
 * @param pool - DuckDB connection pool
 * @returns Array of function metadata
 */
export async function getDuckDBFunctions(
  pool: AsyncDuckDBConnectionPool,
): Promise<DBFunctionsMetadata[]> {
  const conn = await pool.getPooledConnection();
  try {
    const sql =
      'SELECT DISTINCT ON(function_name) function_name, description, parameters, return_type, function_type, schema_name FROM duckdb_functions()';
    const res = await conn.query<any>(sql);
    const columns = {
      function_name: res.getChild('function_name'),
      description: res.getChild('description'),
      parameters: res.getChild('parameters'),
      return_type: res.getChild('return_type'),
      function_type: res.getChild('function_type'),
      schema_name: res.getChild('schema_name'),
      internal: res.getChild('internal'),
    };
    const result: DBFunctionsMetadata[] = [];
    for (let i = 0; i < res.numRows; i += 1) {
      const paramValue = columns.parameters?.get(i);
      let parameters: string;
      if (
        paramValue &&
        typeof paramValue === 'object' &&
        typeof paramValue.toArray === 'function'
      ) {
        parameters = paramValue.toArray().join(', ');
      } else {
        parameters = paramValue ?? '';
      }

      result.push({
        function_name: columns.function_name?.get(i) ?? '',
        description: columns.description?.get(i) ?? '',
        parameters,
        return_type: columns.return_type?.get(i) ?? '',
        function_type: columns.function_type?.get(i) ?? '',
        schema_name: columns.schema_name?.get(i) ?? '',
        internal: columns.internal?.get(i) ?? false,
      });
    }
    return result;
  } finally {
    await conn.close();
  }
}
