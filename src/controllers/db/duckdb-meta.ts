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
 * @param database_name - database name to filter by. Default is 'memory'.
 * @param schema_name - schema name to filter by. Default is 'main'.
 * @returns Array of view names or null in case of errors.
 */
export async function getViews(
  conn: AsyncDuckDBConnection,
  database_name: string = 'memory',
  schema_name: string = 'main',
): Promise<string[] | null> {
  const sql = `
    SELECT view_name 
    FROM duckdb_views
    WHERE database_name == '${toDuckDBIdentifier(database_name)}'
      AND schema_name == '${toDuckDBIdentifier(schema_name)}'
  `;

  return queryOneColumn<arrow.Utf8>(conn, sql, 'view_name');
}

function buildColumnsQueryWithFilters(database_names?: string[], schema_names?: string[]): string {
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
    ${database_names || schema_names ? 'WHERE 1=1 ' : ''}
    ${database_names ? `AND dc.database_name in ('${database_names.join("','")}') ` : ''}
    ${schema_names ? `AND dc.schema_name in ('${schema_names.join("','")}') ` : ''}
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
 * @param database_names - Optional database names to filter by
 * @param schema_names - Optional schema names to filter by
 * @returns Table and column information in Arrow IPC format
 */
async function getTablesAndColumns(
  conn: AsyncDuckDBConnection,
  database_names?: string[],
  schema_names?: string[],
): Promise<ColumnsQueryReturnType[] | null> {
  const sql = buildColumnsQueryWithFilters(database_names, schema_names);
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
 * @param database_names - Optional database names to filter by
 * @param schema_names - Optional schema names to filter by
 * @returns Table and column information in Arrow IPC format
 */
export async function getDatabaseModel(
  conn: AsyncDuckDBConnection,
  database_names?: string[],
  schema_names?: string[],
): Promise<Map<string, DataBaseModel> | null> {
  const duckdbColumns = await getTablesAndColumns(conn, database_names, schema_names);
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
