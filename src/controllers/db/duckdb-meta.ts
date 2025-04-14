import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DataBaseModel } from '@models/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import * as arrow from 'apache-arrow';

async function queryOneColumn<VT extends arrow.DataType>(
  conn: AsyncDuckDBConnection,
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
  conn: AsyncDuckDBConnection,
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
  conn: AsyncDuckDBConnection,
  databaseName: string = 'memory',
  schemaName: string = 'main',
): Promise<string[] | null> {
  const sql = `
    SELECT view_name 
    FROM duckdb_views
    WHERE database_name == '${toDuckDBIdentifier(databaseName)}'
      AND schema_name == '${toDuckDBIdentifier(schemaName)}'
  `;

  return queryOneColumn<arrow.Utf8>(conn, sql, 'view_name');
}

function buildColumnsQueryWithFilters(databaseNames?: string[], schemaName?: string[]): string {
  const quotedDatabaseNames = databaseNames?.map((name) => `'${toDuckDBIdentifier(name)}'`);
  const quotedSchemaNames = schemaName?.map((name) => `'${toDuckDBIdentifier(name)}'`);

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
    ${quotedDatabaseNames || quotedSchemaNames ? 'WHERE 1=1 ' : ''}
    ${quotedDatabaseNames ? `AND dc.database_name in ('${quotedDatabaseNames.join("','")}') ` : ''}
    ${quotedSchemaNames ? `AND dc.schema_name in ('${quotedSchemaNames.join("','")}') ` : ''}
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
 * @returns Table and column information in Arrow IPC format
 */
async function getTablesAndColumns(
  conn: AsyncDuckDBConnection,
  databaseNames?: string[],
  schemaNames?: string[],
): Promise<ColumnsQueryReturnType[] | null> {
  const sql = buildColumnsQueryWithFilters(databaseNames, schemaNames);
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
      !is_table ||
      !column_name ||
      !column_index ||
      !data_type ||
      !is_nullable
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
 * @param databaseNames - Optional database names to filter by
 * @param schemaNames - Optional schema names to filter by
 * @returns Table and column information in Arrow IPC format
 */
export async function getDatabaseModel(
  conn: AsyncDuckDBConnection,
  databaseNames?: string[],
  schemaNames?: string[],
): Promise<Map<string, DataBaseModel> | null> {
  const duckdbColumns = await getTablesAndColumns(conn, databaseNames, schemaNames);
  if (!duckdbColumns) {
    return null;
  }

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

    const column = {
      name: item.column_name,
      type: item.data_type,
      nullable: item.is_nullable,
    };
    tableOrView.columns.push(column);
  });

  return dbMap;
}
