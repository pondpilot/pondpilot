import { ConnectionPool } from '@engines/types';
import { DataBaseModel, DBColumn, DBFunctionsMetadata, DBTableOrView } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { isTauriEnvironment } from '@utils/browser';
import { getTableColumnId } from '@utils/db';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { quote } from '@utils/helpers';
import * as arrow from 'apache-arrow';

async function queryOneColumn<VT extends arrow.DataType>(
  conn: ConnectionPool,
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
 * @param excludeSystem - Exclude system databases from the result. Default is true.
 * @returns Array of database names or null in case of errors.
 */
export async function getLocalDBs(
  conn: ConnectionPool,
  excludeSystem: boolean = true,
): Promise<string[] | null> {
  const sql = `
    SELECT database_name 
    FROM duckdb_databases
    ${excludeSystem ? 'WHERE NOT internal' : ''}
  `;

  const result = await queryOneColumn<arrow.Utf8>(conn, sql, 'database_name');
  // // console.log('[getLocalDBs] Found databases:', result);
  return result;
}

/**
 * Get all user defined views.
 *
 * @param conn - DuckDB connection
 * @param databaseName - database name to filter by. Default is 'PERSISTENT_DB_NAME'.
 * @param schemaName - schema name to filter by. Default is 'main'.
 * @returns Array of view names or null in case of errors.
 */
export async function getViews(
  conn: ConnectionPool,
  databaseName: string = PERSISTENT_DB_NAME,
  schemaName: string = 'main',
): Promise<string[] | null> {
  // On Tauri, the persistent DB is opened as 'main'
  const effectiveDbName =
    isTauriEnvironment() && databaseName === PERSISTENT_DB_NAME ? 'main' : databaseName;
  const sql = `
    SELECT view_name 
    FROM duckdb_views
    WHERE database_name == ${quote(effectiveDbName, { single: true })}
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

  // For attached databases, we may need to query information_schema directly
  // as duckdb_columns might not be populated in Tauri
  // Let's add logging to see what's happening
  // console.log('[buildColumnsQueryWithFilters] Building query for databases:', databaseNames);

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
  conn: ConnectionPool,
  databaseNames?: string[],
  schemaNames?: string[],
  objectNames?: string[],
): Promise<ColumnsQueryReturnType[]> {
  const sql = buildColumnsQueryWithFilters(databaseNames, schemaNames, objectNames);
  // console.log('[getTablesAndColumns] Executing SQL:', sql);
  // console.log('[getTablesAndColumns] Database names:', databaseNames);

  // For Tauri, try to ensure metadata is fresh by querying system tables first
  if (databaseNames && databaseNames.length > 0) {
    try {
      // Query duckdb_databases to verify the database is attached
      const dbCheckQuery = `SELECT database_name, path FROM duckdb_databases WHERE database_name IN (${databaseNames.map((name) => `'${name}'`).join(',')})`;
      const _dbCheckResult = await conn.query(dbCheckQuery);
      // console.log('[getTablesAndColumns] Database check result:', _dbCheckResult);

      // Try to force metadata refresh by querying PRAGMA
      for (const dbName of databaseNames) {
        if (dbName !== 'memory' && dbName !== 'temp' && dbName !== 'system') {
          try {
            // Try PRAGMA database_list to see if it helps
            await conn.query('PRAGMA database_list');

            // Try querying the tables directly using information_schema
            const tablesQuery = `
              SELECT 
                '${dbName}' as database_name,
                schema_name,
                table_name,
                table_type
              FROM information_schema.tables
              WHERE table_catalog = '${dbName}'
                AND schema_name NOT IN ('information_schema', 'pg_catalog')
            `;
            const _tablesResult = await conn.query(tablesQuery);
            // console.log(`[getTablesAndColumns] Tables in ${dbName}:`, _tablesResult);
          } catch (e) {
            // console.log(
            //   `[getTablesAndColumns] Could not query information_schema for ${dbName}:`,
            //   e,
            // );
          }
        }
      }
    } catch (e) {
      // console.log('[getTablesAndColumns] Error checking databases:', e);
    }
  }

  const res = await conn.query<ColumnsQueryArrowType>(sql);

  // console.log('[getTablesAndColumns] Query result:', res);
  // console.log('[getTablesAndColumns] numRows:', res.numRows);
  // console.log('[getTablesAndColumns] Result type:', typeof res);
  // console.log('[getTablesAndColumns] Has getChild method:', typeof res.getChild === 'function');

  // Handle Arrow table format
  const ret: ColumnsQueryReturnType[] = [];
  const numRows = res.numRows || res.rowCount || 0;

  if (numRows === 0) {
    // console.log('[getTablesAndColumns] No rows returned from metadata query');
    return ret;
  }

  // Get column vectors from the Arrow table
  // console.log(
  //   '[getTablesAndColumns] Available columns:',
  //   res.getColumnNames ? res.getColumnNames() : 'getColumnNames not available',
  // );

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

  // console.log(
  //   '[getTablesAndColumns] Column vectors retrieved:',
  //   Object.keys(columns).map((k) => `${k}: ${(columns as any)[k] ? 'found' : 'null'}`),
  // );

  for (let i = 0; i < numRows; i += 1) {
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
  conn: ConnectionPool,
  databaseNames?: string[],
  schemaNames?: string[],
): Promise<Map<string, DataBaseModel>> {
  const adjustedDbNames = databaseNames?.map((n) =>
    isTauriEnvironment() && n === PERSISTENT_DB_NAME ? 'main' : n,
  );
  const duckdbColumns = await getTablesAndColumns(conn, adjustedDbNames, schemaNames);
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

  // In Tauri, normalize 'main' to the persistent name so the UI consistently
  // references PERSISTENT_DB_NAME across environments.
  if (isTauriEnvironment() && dbMap.has('main') && !dbMap.has(PERSISTENT_DB_NAME)) {
    const mainDb = dbMap.get('main')!;
    const normalized: DataBaseModel = { ...mainDb, name: PERSISTENT_DB_NAME };
    dbMap.delete('main');
    dbMap.set(PERSISTENT_DB_NAME, normalized);
  }

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
  conn: ConnectionPool,
  databaseName: string,
  schemaName: string,
  objectNames: string[],
): Promise<DBTableOrView[]> {
  if (objectNames.length === 0) return [];

  const effectiveDbName =
    isTauriEnvironment() && databaseName === PERSISTENT_DB_NAME ? 'main' : databaseName;
  const duckdbColumns = await getTablesAndColumns(
    conn,
    [effectiveDbName],
    [schemaName],
    objectNames,
  );

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
export async function getDuckDBFunctions(pool: ConnectionPool): Promise<DBFunctionsMetadata[]> {
  const sql =
    'SELECT DISTINCT ON(function_name) function_name, description, parameters, examples, internal FROM duckdb_functions()';
  const res = await pool.query(sql);

  const columns = {
    function_name: res.getChild('function_name'),
    description: res.getChild('description'),
    parameters: res.getChild('parameters'),
    examples: res.getChild('examples'),
    internal: res.getChild('internal'),
  };

  const result: DBFunctionsMetadata[] = [];
  for (let i = 0; i < res.numRows; i += 1) {
    const parametersValue = columns.parameters?.get(i);
    let parameters: string[];
    if (
      parametersValue &&
      typeof parametersValue === 'object' &&
      typeof parametersValue.toArray === 'function'
    ) {
      parameters = parametersValue.toArray();
    } else {
      parameters = [];
    }

    const examplesValue = columns.examples?.get(i);
    let examples: string[] | null = null;
    if (
      examplesValue &&
      typeof examplesValue === 'object' &&
      typeof examplesValue.toArray === 'function'
    ) {
      examples = examplesValue.toArray();
    }

    result.push({
      function_name: columns.function_name?.get(i) ?? '',
      description: columns.description?.get(i) || null,
      parameters,
      examples,
      internal: columns.internal?.get(i) ?? false,
    });
  }
  return result;
}
